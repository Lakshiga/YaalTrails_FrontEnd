import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { Place } from '../../core/models/place.model';
import { PlaceSeedHome } from '../../core/models/home-reference';
import { categoryIcon } from '../../core/models/category-meta';
import { I18nService } from '../../core/i18n/i18n.service';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function pinIcon(category: string, label: string | null): L.DivIcon {
  const inner = label ?? `<i class="bi ${categoryIcon(category)}"></i>`;
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin" data-category="${escapeHtml(category)}"><span>${inner}</span></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -32],
    tooltipAnchor: [0, -36]
  });
}

const homeIcon = L.divIcon({
  className: 'map-pin-wrap',
  html: '<div class="map-pin home"><i class="bi bi-house-door-fill"></i></div>',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -32],
  tooltipAnchor: [0, -36]
});

@Component({
  selector: 'app-leaflet-map',
  standalone: true,
  template: `<div #mapContainer class="leaflet-map-container" [style.height]="height"></div>`,
  styles: [
    `
      :host { display: block; }
      .leaflet-map-container {
        width: 100%;
        border-radius: var(--radius, 16px);
        overflow: hidden;
        z-index: 0;
      }
    `
  ]
})
export class LeafletMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private router = inject(Router);
  private zone = inject(NgZone);
  private i18n = inject(I18nService);

  constructor() {
    // Re-draw labels and popups when the language changes.
    effect(() => {
      this.i18n.lang();
      if (this.map) this.renderMarkers();
    });
  }

  @Input() places: Place[] = [];
  @Input() showHome = true;
  @Input() height = '400px';
  /** Label pins 1, 2, 3… in list order instead of showing the category icon. */
  @Input() numbered = false;
  /** Draw a dashed line from home through the places in list order. */
  @Input() showRoute = false;
  /** Draw a dashed line from the last place back home (only with showRoute). */
  @Input() routeReturnsHome = false;
  /** Real road geometry ([lat, lng] pairs) to draw instead of straight dashed lines. */
  @Input() routeGeometry: [number, number][] | null = null;
  /** Show each place's name above its pin. Overlapping labels are hidden automatically. */
  @Input() showLabels = true;

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private bounds: L.LatLngExpression[] = [];
  private labels: L.Tooltip[] = [];

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer.nativeElement, { scrollWheelZoom: false }).setView(
      [PlaceSeedHome.Latitude, PlaceSeedHome.Longitude],
      11
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.map.on('zoomend moveend', () => this.declutterLabels());
    this.map.on('popupopen', (e: L.PopupEvent) => this.wirePopupLink(e.popup));
    this.renderMarkers();

    // The container may not have its final size yet (e.g. height: 100% inside a grid); re-fit once layout settles.
    this.resizeObserver = new ResizeObserver(() => this.fitToMarkers());
    this.resizeObserver.observe(this.mapContainer.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.map && Object.keys(changes).some((k) => k !== 'height')) {
      this.renderMarkers();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  private renderMarkers(): void {
    if (!this.map || !this.markersLayer) return;

    this.markersLayer.clearLayers();
    this.labels = [];
    const bounds: L.LatLngExpression[] = [];
    const home: L.LatLngExpression = [PlaceSeedHome.Latitude, PlaceSeedHome.Longitude];

    if (this.showRoute && this.routeGeometry && this.routeGeometry.length > 1) {
      L.polyline(this.routeGeometry, { color: '#ffffff', weight: 8, opacity: 0.9 }).addTo(this.markersLayer);
      L.polyline(this.routeGeometry, { color: '#0e4d4a', weight: 4.5, opacity: 0.95 }).addTo(this.markersLayer);
    } else if (this.showRoute && this.places.length > 0) {
      const route: L.LatLngExpression[] = [home, ...this.places.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)];
      if (this.routeReturnsHome) route.push(home);
      L.polyline(route, { color: '#0e4d4a', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(this.markersLayer);
    }

    this.places.forEach((place, index) => {
      const marker = L.marker([place.latitude, place.longitude], {
        icon: pinIcon(place.category, this.numbered ? String(index + 1) : null),
        riseOnHover: true
      })
        .bindPopup(this.popupHtml(place), { minWidth: 220, maxWidth: 240 })
        .addTo(this.markersLayer!);

      if (this.showLabels) {
        const text = (this.numbered ? `${index + 1}. ` : '') + this.i18n.placeName(place);
        marker.bindTooltip(escapeHtml(text), { permanent: true, direction: 'top', className: 'map-label', opacity: 1 });
        this.labels.push(marker.getTooltip()!);
      }
      bounds.push([place.latitude, place.longitude]);
    });

    if (this.showHome) {
      const homeMarker = L.marker(home, { icon: homeIcon, zIndexOffset: 1000 })
        .bindPopup(
          `<div class="map-popup-body"><div class="map-popup-title">${escapeHtml(this.i18n.t('map.homeRef'))}</div>` +
            `<div class="map-popup-meta">${escapeHtml(this.i18n.t('map.homeSub'))}</div></div>`
        )
        .addTo(this.markersLayer);
      if (this.showLabels) {
        homeMarker.bindTooltip(escapeHtml(this.i18n.t('map.home')), { permanent: true, direction: 'top', className: 'map-label map-label-home', opacity: 1 });
        this.labels.push(homeMarker.getTooltip()!);
      }
      bounds.push(home);
    }

    this.bounds = bounds;
    this.fitToMarkers();
  }

  private popupHtml(place: Place): string {
    const image = place.imageUrl
      ? `<img class="map-popup-img" src="${escapeHtml(place.imageUrl)}" alt="" loading="lazy" />`
      : '';
    return (
      image +
      `<div class="map-popup-body">` +
      `<div class="map-popup-title">${escapeHtml(this.i18n.placeName(place))}</div>` +
      `<div class="map-popup-meta">${escapeHtml(this.i18n.category(place.category))} &middot; ${escapeHtml(this.i18n.t('map.fromHome', { km: place.distanceFromHomeKm }))}</div>` +
      `<a class="map-popup-link" href="/places/${place.id}" data-place-id="${place.id}">${escapeHtml(this.i18n.t('map.viewDetails'))} &rarr;</a>` +
      `</div>`
    );
  }

  /** Route popup links through the Angular router instead of a full page load. */
  private wirePopupLink(popup: L.Popup): void {
    const link = popup.getElement()?.querySelector<HTMLAnchorElement>('a[data-place-id]');
    if (!link) return;
    link.onclick = (event) => {
      event.preventDefault();
      this.zone.run(() => this.router.navigate(['/places', link.dataset['placeId']]));
    };
  }

  /** Hides labels that would overlap a label drawn earlier (earlier places win). */
  private declutterLabels(): void {
    const kept: DOMRect[] = [];
    for (const label of this.labels) {
      const el = label.getElement();
      if (!el) continue;
      el.classList.remove('is-hidden');
      const rect = el.getBoundingClientRect();
      const overlaps = kept.some((r) => rect.left < r.right && rect.right > r.left && rect.top < r.bottom && rect.bottom > r.top);
      if (overlaps) el.classList.add('is-hidden');
      else kept.push(rect);
    }
  }

  private fitToMarkers(): void {
    if (!this.map) return;
    // Fitting while the container has no size yields an invalid zoom and a blank map.
    const { clientWidth, clientHeight } = this.mapContainer.nativeElement;
    if (clientWidth === 0 || clientHeight === 0) return;
    this.map.invalidateSize();
    if (this.bounds.length > 1) {
      this.map.fitBounds(L.latLngBounds(this.bounds), { padding: [50, 50], maxZoom: 14, animate: false });
    } else if (this.bounds.length === 1) {
      this.map.setView(this.bounds[0], 13, { animate: false });
    }
    this.declutterLabels();
  }
}
