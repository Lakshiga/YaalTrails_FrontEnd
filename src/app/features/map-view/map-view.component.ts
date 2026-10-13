import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { Place } from '../../core/models/place.model';
import { LeafletMapComponent } from '../../shared/leaflet-map/leaflet-map.component';
import { categoryIcon } from '../../core/models/category-meta';
import { I18nService } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [RouterLink, LeafletMapComponent],
  templateUrl: './map-view.component.html',
  styleUrl: './map-view.component.css'
})
export class MapViewComponent implements OnInit {
  private placeService = inject(PlaceService);

  readonly categoryIcon = categoryIcon;
  readonly i18n = inject(I18nService);

  allPlaces = signal<Place[]>([]);
  selectedCategory = signal('All');
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  categories = computed(() => [...new Set(this.allPlaces().map((p) => p.category))].sort());

  places = computed(() => {
    const category = this.selectedCategory();
    return this.allPlaces()
      .filter((p) => category === 'All' || p.category === category)
      .sort((a, b) => a.distanceFromHomeKm - b.distanceFromHomeKm);
  });

  ngOnInit(): void {
    this.placeService.getAll().subscribe({
      next: (places) => {
        this.allPlaces.set(places);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load places. Please make sure the backend API is running.');
        this.loading.set(false);
      }
    });
  }
}
