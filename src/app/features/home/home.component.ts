import { Component, OnInit, inject, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { Place } from '../../core/models/place.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, SlicePipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  private placeService = inject(PlaceService);
  private visitPlan = inject(VisitPlanService);

  places = signal<Place[]>([]);
  categories = signal<string[]>([]);
  selectedCategory = signal<string>('All');
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.placeService.getCategories().subscribe({
      next: (cats) => this.categories.set(cats)
    });
    this.loadPlaces();
  }

  loadPlaces(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.placeService.getAll(this.selectedCategory()).subscribe({
      next: (places) => {
        this.places.set(places);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load places. Please make sure the backend API is running.');
        this.loading.set(false);
      }
    });
  }

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
    this.loadPlaces();
  }

  isInPlan(place: Place): boolean {
    return this.visitPlan.isInPlan(place.id);
  }

  toggleInPlan(place: Place, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.visitPlan.toggle(place);
  }
}
