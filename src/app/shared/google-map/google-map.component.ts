import { AfterViewInit, Component, ElementRef, NgZone, OnChanges, OnDestroy, SimpleChanges, ViewChild, effect, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { PlaceSeedHome, SERVICE_RADIUS_KM } from '../../core/models/home-reference';
import { I18nService } from '../../core/i18n/i18n.service';
import { GoogleMapsService } from '../../core/services/google-maps.service';
import { LatLng, hasValidCoordinates } from '../../core/utils/geo';
import { END_PIN_HTML, HOME_PIN_HTML, MapInputs, MapPopups, USER_DOT_HTML, escapeHtml, pinHtml, shortLabel } from '../map-common/map-common';

const BRAND = '#0e4d4a';
const MAX_FIT_ZOOM = 14;

function toLatLng(point: LatLng): google.maps.LatLngLiteral {
  return { lat: point.latitude, lng: point.longitude };
}

/** Builds marker content: an optional name label above the pin (styles in styles.css). */
function markerContent(innerHtml: string, label: string | null, labelClass = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = 'gmap-marker';
  el.innerHTML = (label ? `<span class="gmap-label ${labelClass}">${escapeHtml(label)}</span>` : '') + innerHtml;
  return el;
}

/** The same map as LeafletMapComponent, drawn with the Google Maps JavaScript API. */
@Component({
  selector: 'app-google-map',
  standalone: true,
  template: `<div #mapContainer class="gmap-container" [style.height]="height"></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host { display: block; }
      .gmap-container { width: 100%; border-radius: var(--radius, 16px); overflow: hidden; }
    `
  ]
})
export class GoogleMapComponent extends MapInputs implements AfterViewInit, OnChanges, OnDestroy {
  private router = inject(Router);
  private zone = inject(NgZone);
  private i18n = inject(I18nService);
  private googleMaps = inject(GoogleMapsService);
  private popups = new MapPopups(this.i18n);

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private map: google.maps.Map | null = null;
  private info: google.maps.InfoWindow | null = null;
  private markers: google.maps.marker.AdvancedMarkerElement[] = [];
  private shapes: (google.maps.Polyline | google.maps.Circle)[] = [];
  private bounds: google.maps.LatLngLiteral[] = [];
  private resizeObserver: ResizeObserver | null = null;
  /** Pin labels with their priority (lower wins when two overlap). */
  private labels: { el: HTMLElement; priority: number }[] = [];

  constructor() {
    super();
    // Re-draw labels and popups when the language changes.
    effect(() => {
      this.i18n.lang();
      if (this.map) this.render();
    });
  }

  ngAfterViewInit(): void {
    this.map = new google.maps.Map(this.mapContainer.nativeElement, {
      center: toLatLng(this.centerPoint()),
      zoom: 11,
      mapId: this.googleMaps.mapId,
      gestureHandling: 'cooperative',
      mapTypeControl: false,
      streetViewControl: false,
      clickableIcons: false
    });
    this.info = new google.maps.InfoWindow({ maxWidth: 260 });
    // Re-check which labels fit after every pan or zoom.
    this.map.addListener('idle', () => this.declutterLabels());
    this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (this.pickMode && e.latLng) {
        const point = { latitude: e.latLng.lat(), longitude: e.latLng.lng() };
        this.zone.run(() => this.mapClick.emit(point));
      }
    });
    this.map.setOptions({ draggableCursor: this.pickMode ? 'crosshair' : null });
    this.render();

    // The container may not have its final size yet (e.g. height: 100% inside a grid); re-fit once layout settles.
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.mapContainer.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('pickMode' in changes) this.map?.setOptions({ draggableCursor: this.pickMode ? 'crosshair' : null });
    if (this.map && Object.keys(changes).some((k) => !['height', 'pickMode'].includes(k))) this.render();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.clear();
    this.info?.close();
  }

  private render(): void {
    if (!this.map) return;
    this.clear();
    const bounds: google.maps.LatLngLiteral[] = [];
    const home = toLatLng(this.homePoint ?? { latitude: PlaceSeedHome.Latitude, longitude: PlaceSeedHome.Longitude });
    const mappable = this.places.filter((p) => hasValidCoordinates(p));

    if (this.showServiceArea) {
      this.shapes.push(
        new google.maps.Circle({
          map: this.map,
          center: home,
          radius: SERVICE_RADIUS_KM * 1000,
          strokeColor: BRAND,
          strokeOpacity: 0.5,
          strokeWeight: 1.5,
          fillColor: BRAND,
          fillOpacity: 0.03,
          clickable: false
        })
      );
    }

    if (this.showRoute && this.routeGeometry && this.routeGeometry.length > 1) {
      const path = this.routeGeometry.map(([lat, lng]) => ({ lat, lng }));
      this.shapes.push(new google.maps.Polyline({ map: this.map, path, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, clickable: false }));
      this.shapes.push(new google.maps.Polyline({ map: this.map, path, strokeColor: BRAND, strokeWeight: 4.5, strokeOpacity: 0.95, clickable: false }));
    } else if (this.showRoute && mappable.length > 0) {
      const path = [home, ...mappable.map(toLatLng)];
      if (this.routeReturnsHome) path.push(home);
      else if (this.endPoint) path.push(toLatLng(this.endPoint));
      // Dashed line: an invisible stroke with repeated dash symbols.
      this.shapes.push(
        new google.maps.Polyline({
          map: this.map,
          path,
          strokeOpacity: 0,
          clickable: false,
          icons: [{ icon: { path: 'M 0,-1 0,1', strokeColor: BRAND, strokeOpacity: 0.7, scale: 3 }, offset: '0', repeat: '14px' }]
        })
      );
    }

    this.places.forEach((place, index) => {
      // Skip places with missing coordinates rather than dropping a pin at (0, 0).
      if (!hasValidCoordinates(place)) return;
      const label = this.showLabels ? (this.numbered ? `${index + 1}. ` : '') + shortLabel(this.i18n.placeName(place)) : null;
      this.addMarker(toLatLng(place), markerContent(pinHtml(place.category, this.numbered ? String(index + 1) : null), label), {
        title: this.i18n.placeName(place),
        popup: this.popups.place(place, this.userLocation),
        // Our own places outrank Google places when labels overlap.
        zIndex: place.external ? 5 : 10,
        labelPriority: place.external ? 3 : 2
      });
      bounds.push(toLatLng(place));
    });

    if (this.showHome) {
      const label = this.showLabels ? (this.homeLabel ?? this.i18n.t('map.home')) : null;
      this.addMarker(home, markerContent(HOME_PIN_HTML, label, 'gmap-label-home'), {
        title: this.homeLabel ?? this.i18n.t('map.home'),
        popup: this.popups.home(this.homeLabel),
        zIndex: 20,
        labelPriority: 1
      });
      bounds.push(home);
    }

    if (this.endPoint && hasValidCoordinates(this.endPoint)) {
      const label = this.showLabels && this.endLabel ? shortLabel(this.endLabel) : null;
      this.addMarker(toLatLng(this.endPoint), markerContent(END_PIN_HTML, label, 'gmap-label-home'), {
        title: this.endLabel ?? this.i18n.t('trip.end'),
        popup: this.popups.end(this.endLabel),
        zIndex: 20,
        labelPriority: 1
      });
      bounds.push(toLatLng(this.endPoint));
    }

    for (const extra of this.externalPlaces) {
      if (!hasValidCoordinates(extra)) continue;
      const dot = document.createElement('div');
      dot.className = 'gmap-dot' + (extra.notable ? ' notable' : '');
      this.addMarker(toLatLng(extra), dot, {
        title: this.popups.externalName(extra),
        popup: this.popups.external(extra, this.userLocation),
        zIndex: 1,
        optional: true
      });
      bounds.push(toLatLng(extra));
    }

    if (this.userLocation && hasValidCoordinates(this.userLocation)) {
      const you = markerContent(USER_DOT_HTML, this.showLabels ? this.i18n.t('map.you') : null, 'gmap-label-you');
      you.classList.add('gmap-marker-centered');
      this.addMarker(toLatLng(this.userLocation), you, { title: this.i18n.t('map.you'), popup: this.popups.you(), zIndex: 30, labelPriority: 0 });
      bounds.push(toLatLng(this.userLocation));
    }

    this.bounds = bounds;
    this.fit();
    // New markers appear over the next frames (later still on a freshly created map): tidy their labels once
    // they have a size. Every pan or zoom re-checks too (the 'idle' listener).
    requestAnimationFrame(() => this.declutterLabels());
    setTimeout(() => this.declutterLabels(), 400);
  }

  private addMarker(
    position: google.maps.LatLngLiteral,
    content: HTMLElement,
    options: { title: string; popup: string; zIndex: number; optional?: boolean; labelPriority?: number }
  ): void {
    const label = content.querySelector<HTMLElement>('.gmap-label');
    if (label) this.labels.push({ el: label, priority: options.labelPriority ?? 2 });
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map: this.map,
      position,
      content,
      title: options.title,
      zIndex: options.zIndex,
      // Small extra-place dots give way when they would overlap; our own pins always show.
      collisionBehavior: options.optional
        ? google.maps.CollisionBehavior.OPTIONAL_AND_HIDES_LOWER_PRIORITY
        : google.maps.CollisionBehavior.REQUIRED
    });
    marker.addListener('click', () => this.openPopup(marker, options.popup));
    this.markers.push(marker);
  }

  private openPopup(marker: google.maps.marker.AdvancedMarkerElement, html: string): void {
    if (!this.info || !this.map) return;
    const content = document.createElement('div');
    content.className = 'gmap-popup';
    content.innerHTML = html;
    // Route "View details" through the Angular router instead of a full page load.
    const link = content.querySelector<HTMLAnchorElement>('a[data-route]');
    if (link) {
      link.onclick = (event) => {
        event.preventDefault();
        this.info?.close();
        this.zone.run(() => this.router.navigateByUrl(link.dataset['route']!));
      };
    }
    this.info.setContent(content);
    this.info.open({ map: this.map, anchor: marker });
  }

  private clear(): void {
    for (const marker of this.markers) marker.map = null;
    for (const shape of this.shapes) shape.setMap(null);
    this.markers = [];
    this.shapes = [];
    this.labels = [];
  }

  /** Hides labels that would cover another place's pin or a more important label (pins always stay). */
  private declutterLabels(): void {
    // Each obstacle remembers its marker, so a label never counts as covering its own pin.
    const kept: { rect: DOMRect; marker: Element | null }[] = [...this.mapContainer.nativeElement.querySelectorAll('.map-pin, .map-user-dot')]
      .map((pin) => ({ rect: pin.getBoundingClientRect(), marker: pin.closest('.gmap-marker') }))
      .filter((o) => o.rect.width > 0);
    const ordered = this.labels.map((l, order) => ({ ...l, order })).sort((a, b) => a.priority - b.priority || a.order - b.order);
    for (const { el } of ordered) {
      el.classList.remove('is-hidden');
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      const marker = el.closest('.gmap-marker');
      const overlaps = kept.some(
        (o) => o.marker !== marker && rect.left < o.rect.right && rect.right > o.rect.left && rect.top < o.rect.bottom && rect.bottom > o.rect.top
      );
      if (overlaps) el.classList.add('is-hidden');
      else kept.push({ rect, marker });
    }
  }


  private centerPoint(): LatLng {
    return this.center ?? { latitude: PlaceSeedHome.Latitude, longitude: PlaceSeedHome.Longitude };
  }

  private fit(): void {
    const map = this.map;
    if (!map) return;
    const { clientWidth, clientHeight } = this.mapContainer.nativeElement;
    if (clientWidth === 0 || clientHeight === 0) return;
    if (this.bounds.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      this.bounds.forEach((p) => bounds.extend(p));
      map.fitBounds(bounds, 50);
      // fitBounds zooms right in on close-together places; cap it like the Leaflet map does.
      google.maps.event.addListenerOnce(map, 'idle', () => {
        if ((map.getZoom() ?? 0) > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM);
      });
    } else if (this.bounds.length === 1) {
      map.setCenter(this.bounds[0]);
      map.setZoom(13);
    } else {
      map.setCenter(toLatLng(this.centerPoint()));
      map.setZoom(10);
    }
  }
}
