import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlaceService } from '../../../core/services/place.service';
import { AuthService } from '../../../core/services/auth.service';
import { AdminReview, Place } from '../../../core/models/place.model';
import { ReviewService } from '../../../core/services/review.service';
import { StarRatingComponent } from '../../../shared/star-rating/star-rating.component';
import { ALL_CATEGORIES, categoryIcon } from '../../../core/models/category-meta';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, StarRatingComponent],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit {
  private placeService = inject(PlaceService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private reviewService = inject(ReviewService);

  readonly categoryIcon = categoryIcon;

  places = signal<Place[]>([]);
  reviews = signal<AdminReview[]>([]);
  reviewsLoading = signal(true);
  search = signal('');
  loading = signal(true);
  errorMessage = signal<string | null>(null);

  categoryCounts = computed(() =>
    ALL_CATEGORIES.map((name) => ({ name, count: this.places().filter((p) => p.category === name).length }))
  );

  filteredPlaces = computed(() => {
    const term = this.search().trim().toLowerCase();
    const list = [...this.places()].sort((a, b) => a.name.localeCompare(b.name));
    return term ? list.filter((p) => p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)) : list;
  });

  ngOnInit(): void {
    this.load();
    this.loadReviews();
  }

  loadReviews(): void {
    this.reviewsLoading.set(true);
    this.reviewService.getAll().subscribe({
      next: (reviews) => {
        this.reviews.set(reviews);
        this.reviewsLoading.set(false);
      },
      error: () => this.reviewsLoading.set(false)
    });
  }

  deleteReview(review: AdminReview): void {
    if (!confirm(`Delete the review by "${review.visitorName}" on ${review.placeName}?`)) return;
    this.reviewService.delete(review.id).subscribe({
      next: () => {
        this.reviews.set(this.reviews().filter((r) => r.id !== review.id));
        this.load();
      },
      error: () => this.errorMessage.set('Failed to delete review.')
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  load(): void {
    this.loading.set(true);
    this.placeService.getAll().subscribe({
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

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  deletePlace(place: Place): void {
    if (!confirm(`Delete "${place.name}"? This cannot be undone.`)) return;

    this.placeService.delete(place.id).subscribe({
      next: () => this.places.set(this.places().filter((p) => p.id !== place.id)),
      error: () => this.errorMessage.set('Failed to delete place.')
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/']);
  }
}
