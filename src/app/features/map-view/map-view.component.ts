import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { Place } from '../../core/models/place.model';
import { LeafletMapComponent } from '../../shared/leaflet-map/leaflet-map.component';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [RouterLink, LeafletMapComponent],
  templateUrl: './map-view.component.html',
  styleUrl: './map-view.component.css'
})
export class MapViewComponent implements OnInit {
  private placeService = inject(PlaceService);

  places = signal<Place[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    this.placeService.getAll().subscribe({
      next: (places) => {
        this.places.set(places);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
