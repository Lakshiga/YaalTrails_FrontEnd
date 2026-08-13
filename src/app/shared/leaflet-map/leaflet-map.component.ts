import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import * as L from 'leaflet';
import { Place } from '../../core/models/place.model';
import { PlaceSeedHome } from '../../core/models/home-reference';

// Fix Leaflet's default marker icon paths, which break under bundlers.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'leaflet-images/marker-icon-2x.png',
  iconUrl: 'leaflet-images/marker-icon.png',
  shadowUrl: 'leaflet-images/marker-shadow.png'
});

const homeIcon = L.divIcon({
  className: 'home-marker',
  html: '<div class="home-marker-dot">🏠</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

@Component({
  selector: 'app-leaflet-map',
  standalone: true,
  template: `<div #mapContainer class="leaflet-map-container" [style.height]="height"></div>`,
  styles: [
    `
      .leaflet-map-container {
        width: 100%;
        border-radius: 0.5rem;
        z-index: 0;
      }
      :host ::ng-deep .home-marker-dot {
        font-size: 1.3rem;
        text-align: center;
      }
    `
  ]
})
export class LeafletMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() places: Place[] = [];
  @Input() showHome = true;
  @Input() height = '400px';

  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapContainer.nativeElement).setView(
      [PlaceSeedHome.Latitude, PlaceSeedHome.Longitude],
      11
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.renderMarkers();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['places'] && this.map) {
      this.renderMarkers();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private renderMarkers(): void {
    if (!this.map || !this.markersLayer) return;

    this.markersLayer.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    if (this.showHome) {
      L.marker([PlaceSeedHome.Latitude, PlaceSeedHome.Longitude], { icon: homeIcon })
        .bindPopup('Home / Reference Point (Jaffna Town)')
        .addTo(this.markersLayer);
      bounds.push([PlaceSeedHome.Latitude, PlaceSeedHome.Longitude]);
    }

    for (const place of this.places) {
      L.marker([place.latitude, place.longitude])
        .bindPopup(`<strong>${place.name}</strong><br/>${place.category} &middot; ${place.distanceFromHomeKm} km from home`)
        .addTo(this.markersLayer);
      bounds.push([place.latitude, place.longitude]);
    }

    if (bounds.length > 0) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 14 });
    }
  }
}
