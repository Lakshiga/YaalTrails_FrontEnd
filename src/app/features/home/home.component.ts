import { Component, ElementRef, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { Place } from '../../core/models/place.model';
import { categoryIcon } from '../../core/models/category-meta';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { StarRatingComponent } from '../../shared/star-rating/star-rating.component';
import { WeatherWidgetComponent } from '../../shared/weather-widget/weather-widget.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, StarRatingComponent, WeatherWidgetComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  private placeService = inject(PlaceService);
  private visitPlan = inject(VisitPlanService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);

  @ViewChild('placesSection') placesSection?: ElementRef<HTMLElement>;

  readonly categoryIcon = categoryIcon;
  readonly skeletons = [1, 2, 3, 4, 5, 6];

  allPlaces = signal<Place[]>([]);
  selectedCategory = signal<string>('All');
  search = signal('');
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  planCount = computed(() => this.visitPlan.plan().length);

  categories = computed(() => {
    const counts = new Map<string, number>();
    for (const p of this.allPlaces()) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
  });

  places = computed(() => {
    const category = this.selectedCategory();
    const term = this.search().trim().toLowerCase();
    return this.allPlaces()
      .filter((p) => category === 'All' || p.category === category)
      .filter(
        (p) =>
          !term ||
          [p.name, p.nameTa, p.description, p.descriptionTa].some((text) => text?.toLowerCase().includes(term))
      )
      .sort((a, b) => a.distanceFromHomeKm - b.distanceFromHomeKm);
  });

  ngOnInit(): void {
    this.loadPlaces();
  }

  loadPlaces(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
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

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.search.set('');
    this.selectedCategory.set('All');
  }

  scrollToPlaces(): void {
    this.placesSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  isInPlan(place: Place): boolean {
    return this.visitPlan.isInPlan(place.id);
  }

  toggleInPlan(place: Place): void {
    const adding = !this.visitPlan.isInPlan(place.id);
    this.visitPlan.toggle(place);
    const name = this.i18n.placeName(place);
    this.toast.show(this.i18n.t(adding ? 'toast.added' : 'toast.removed', { name }), adding ? 'bi-check2-circle' : 'bi-dash-circle');
  }
}
