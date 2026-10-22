import { AfterViewInit, Component, ElementRef, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild, effect, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import * as L from 'leaflet';
import { PlaceSeedHome, SERVICE_RADIUS_KM } from '../../core/models/home-reference';
import { I18nService } from '../../core/i18n/i18n.service';
import { MAP_TILES } from '../../core/config';
import { hasValidCoordinates } from '../../core/utils/geo';
import { END_PIN_HTML, HOME_PIN_HTML, MapInputs, MapPopups, USER_DOT_HTML, escapeHtml, pinHtml, shortLabel } from '../map-common/map-common';

const PIN_OPTIONS = { className: 'map-pin-wrap', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32], tooltipAnchor: [0, -36] } as const;

function pinIcon(category: string, label: string | null): L.DivIcon {
  return L.divIcon({ ...PIN_OPTIONS, html: pinHtml(category, label) } as L.DivIconOptions);
}

const homeIcon = L.divIcon({ ...PIN_OPTIONS, html: HOME_PIN_HTML } as L.DivIconOptions);
const endIcon = L.divIcon({ ...PIN_OPTIONS, html: END_PIN_HTML } as L.DivIconOptions);

const userIcon = L.divIcon({
  className: 'map-pin-wrap',
  html: USER_DOT_HTML,
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -10],
  tooltipAnchor: [0, -14]
});

/** OpenStreetMap tiles drawn with Leaflet — used when no Google Maps key is configured. */
@Component({
  selector: 'app-leaflet-map',
  standalone: true,
  template: `<div #mapContainer class="leaflet-map-container" [style.height]="height"></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
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
export class LeafletMapComponent extends MapInputs implements AfterViewInit, OnChanges, OnDestroy {
  private router = inject(Router);
  private zone = inject(NgZone);
  private i18n = inject(I18nService);
  private popups = new MapPopups(this.i18n);

  constructor() {
    super();
    // Re-draw labels and popups when the language changes.
    effect(() => {
      this.i18n.lang();
      if (this.map) this.renderMarkers();
    });
  }

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private bounds: L.LatLngExpression[] = [];
  private labels: L.Tooltip[] = [];

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer.nativeElement, { scrollWheelZoom: false }).setView(this.centerPoint(), 11);

    L.tileLayer(MAP_TILES.url, { attribution: MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.map.on('zoomend moveend', () => this.declutterLabels());
    this.map.on('popupopen', (e: L.PopupEvent) => this.wirePopupLink(e.popup));
    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.pickMode) this.zone.run(() => this.mapClick.emit({ latitude: e.latlng.lat, longitude: e.latlng.lng }));
    });
    this.renderMarkers();
    this.updatePickCursor();

    // The container may not have its final size yet (e.g. height: 100% inside a grid); re-fit once layout settles.
    this.resizeObserver = new ResizeObserver(() => this.fitToMarkers());
    this.resizeObserver.observe(this.mapContainer.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('pickMode' in changes) this.updatePickCursor();
    if (this.map && Object.keys(changes).some((k) => !['height', 'pickMode'].includes(k))) {
      this.renderMarkers();
    }
  }

  private updatePickCursor(): void {
    this.mapContainer?.nativeElement.classList.toggle('is-picking', this.pickMode);
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
    const home: L.LatLngExpression = this.homePoint
      ? [this.homePoint.latitude, this.homePoint.longitude]
      : [PlaceSeedHome.Latitude, PlaceSeedHome.Longitude];
    const mappable = this.places.filter((p) => hasValidCoordinates(p));

    if (this.showServiceArea) {
      L.circle(home, {
        radius: SERVICE_RADIUS_KM * 1000,
        color: '#0e4d4a',
        weight: 1.5,
        opacity: 0.5,
        dashArray: '4 6',
        fillOpacity: 0.03,
        interactive: false
      }).addTo(this.markersLayer);
    }

    if (this.showRoute && this.routeGeometry && this.routeGeometry.length > 1) {
      L.polyline(this.routeGeometry, { color: '#ffffff', weight: 8, opacity: 0.9 }).addTo(this.markersLayer);
      L.polyline(this.routeGeometry, { color: '#0e4d4a', weight: 4.5, opacity: 0.95 }).addTo(this.markersLayer);
    } else if (this.showRoute && mappable.length > 0) {
      const route: L.LatLngExpression[] = [home, ...mappable.map((p) => [p.latitude, p.longitude] as L.LatLngTuple)];
      if (this.routeReturnsHome) route.push(home);
      else if (this.endPoint) route.push([this.endPoint.latitude, this.endPoint.longitude]);
      L.polyline(route, { color: '#0e4d4a', weight: 3, opacity: 0.7, dashArray: '6 8' }).addTo(this.markersLayer);
    }

    this.places.forEach((place, index) => {
      // Skip places with missing coordinates rather than dropping a pin at (0, 0).
      if (!hasValidCoordinates(place)) return;
      const marker = L.marker([place.latitude, place.longitude], {
        icon: pinIcon(place.category, this.numbered ? String(index + 1) : null),
        riseOnHover: true
      })
        .bindPopup(this.popups.place(place, this.userLocation), { minWidth: 220, maxWidth: 240 })
        .addTo(this.markersLayer!);

      if (this.showLabels) {
        const text = (this.numbered ? `${index + 1}. ` : '') + shortLabel(this.i18n.placeName(place));
        marker.bindTooltip(escapeHtml(text), { permanent: true, direction: 'top', className: 'map-label', opacity: 1 });
        this.labels.push(marker.getTooltip()!);
      }
      bounds.push([place.latitude, place.longitude]);
    });

    if (this.showHome) {
      const homeMarker = L.marker(home, { icon: homeIcon, zIndexOffset: 1000 }).bindPopup(this.popups.home(this.homeLabel)).addTo(this.markersLayer);
      if (this.showLabels) {
        homeMarker.bindTooltip(escapeHtml(this.homeLabel ?? this.i18n.t('map.home')), { permanent: true, direction: 'top', className: 'map-label map-label-home', opacity: 1 });
        this.labels.push(homeMarker.getTooltip()!);
      }
      bounds.push(home);
    }

    if (this.endPoint && hasValidCoordinates(this.endPoint)) {
      const end: L.LatLngTuple = [this.endPoint.latitude, this.endPoint.longitude];
      const endMarker = L.marker(end, { icon: endIcon, zIndexOffset: 1000 }).bindPopup(this.popups.end(this.endLabel)).addTo(this.markersLayer);
      if (this.showLabels && this.endLabel) {
        endMarker.bindTooltip(escapeHtml(shortLabel(this.endLabel)), { permanent: true, direction: 'top', className: 'map-label map-label-home', opacity: 1 });
        this.labels.push(endMarker.getTooltip()!);
      }
      bounds.push(end);
    }

    for (const extra of this.externalPlaces) {
      if (!hasValidCoordinates(extra)) continue;
      L.circleMarker([extra.latitude, extra.longitude], {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: extra.notable ? '#0e4d4a' : '#6b7a78',
        fillOpacity: 0.9
      })
        .bindTooltip(escapeHtml(this.popups.externalName(extra)), { direction: 'top', offset: [0, -6] })
        .bindPopup(this.popups.external(extra, this.userLocation), { minWidth: 200, maxWidth: 240 })
        .addTo(this.markersLayer);
      bounds.push([extra.latitude, extra.longitude]);
    }

    if (this.userLocation && hasValidCoordinates(this.userLocation)) {
      const you: L.LatLngTuple = [this.userLocation.latitude, this.userLocation.longitude];
      const youMarker = L.marker(you, { icon: userIcon, zIndexOffset: 2000, title: this.i18n.t('map.you') })
        .bindPopup(this.popups.you())
        .addTo(this.markersLayer);
      if (this.showLabels) {
        youMarker.bindTooltip(escapeHtml(this.i18n.t('map.you')), { permanent: true, direction: 'top', className: 'map-label map-label-you', opacity: 1 });
        this.labels.unshift(youMarker.getTooltip()!);
      }
      bounds.push(you);
    }

    this.bounds = bounds;
    this.fitToMarkers();
  }

  private centerPoint(): L.LatLngTuple {
    return this.center ? [this.center.latitude, this.center.longitude] : [PlaceSeedHome.Latitude, PlaceSeedHome.Longitude];
  }

  /** Route popup links through the Angular router instead of a full page load. */
  private wirePopupLink(popup: L.Popup): void {
    const link = popup.getElement()?.querySelector<HTMLAnchorElement>('a[data-route]');
    if (!link) return;
    link.onclick = (event) => {
      event.preventDefault();
      this.zone.run(() => this.router.navigateByUrl(link.dataset['route']!));
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
    } else {
      this.map.setView(this.centerPoint(), 10, { animate: false });
    }
    this.declutterLabels();
  }
}
