import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { GoogleMapsService } from '../../core/services/google-maps.service';
import { GoogleMapComponent } from '../google-map/google-map.component';
import { LeafletMapComponent } from '../leaflet-map/leaflet-map.component';
import { MapInputs } from '../map-common/map-common';

/** Shows Google Maps when a key is configured and accepted, otherwise the OpenStreetMap (Leaflet) map. */
@Component({
  selector: 'app-map',
  standalone: true,
  imports: [GoogleMapComponent, LeafletMapComponent],
  template: `
    @switch (maps.provider()) {
      @case ('google') {
        <app-google-map
          [places]="places"
          [showHome]="showHome"
          [height]="height"
          [numbered]="numbered"
          [showRoute]="showRoute"
          [routeReturnsHome]="routeReturnsHome"
          [routeGeometry]="routeGeometry"
          [showLabels]="showLabels"
          [userLocation]="userLocation"
          [showServiceArea]="showServiceArea"
          [externalPlaces]="externalPlaces"
          [homePoint]="homePoint"
          [homeLabel]="homeLabel"
          [endPoint]="endPoint"
          [endLabel]="endLabel"
          [center]="center"
          [pickMode]="pickMode"
          (mapClick)="mapClick.emit($event)"
        />
      }
      @case ('leaflet') {
        <app-leaflet-map
          [places]="places"
          [showHome]="showHome"
          [height]="height"
          [numbered]="numbered"
          [showRoute]="showRoute"
          [routeReturnsHome]="routeReturnsHome"
          [routeGeometry]="routeGeometry"
          [showLabels]="showLabels"
          [userLocation]="userLocation"
          [showServiceArea]="showServiceArea"
          [externalPlaces]="externalPlaces"
          [homePoint]="homePoint"
          [homeLabel]="homeLabel"
          [endPoint]="endPoint"
          [endLabel]="endLabel"
          [center]="center"
          [pickMode]="pickMode"
          (mapClick)="mapClick.emit($event)"
        />
      }
      @default {
        <div class="map-loading" [style.height]="height" role="status">
          <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        </div>
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host { display: block; }
      app-google-map, app-leaflet-map { height: 100%; }
      .map-loading { display: grid; place-items: center; border-radius: var(--radius, 16px); background: var(--line-2); color: var(--muted); }
    `
  ]
})
export class MapComponent extends MapInputs implements OnInit {
  readonly maps = inject(GoogleMapsService);

  ngOnInit(): void {
    void this.maps.load();
  }
}
