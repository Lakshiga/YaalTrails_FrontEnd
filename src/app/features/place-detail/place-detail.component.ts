import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { ReviewService } from '../../core/services/review.service';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Place, Review } from '../../core/models/place.model';
import { LeafletMapComponent } from '../../shared/leaflet-map/leaflet-map.component';
import { StarRatingComponent } from '../../shared/star-rating/star-rating.component';
import { categoryIcon } from '../../core/models/category-meta';
import { photoCreditFor } from '../../core/models/photo-credits';
import { estimateRoadKm, estimateTravelMinutes } from '../../core/utils/geo';

const VISIBLE_REVIEWS = 5;

@Component({
  selector: 'app-place-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, LeafletMapComponent, StarRatingComponent],
  templateUrl: './place-detail.component.html',
  styleUrl: './place-detail.component.css'
})
export class PlaceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private placeService = inject(PlaceService);
  private reviewService = inject(ReviewService);
  private visitPlan = inject(VisitPlanService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  readonly i18n = inject(I18nService);

  readonly categoryIcon = categoryIcon;

  place = signal<Place | null>(null);
  allPlaces = signal<Place[]>([]);
  reviews = signal<Review[]>([]);
  showAllReviews = signal(false);
  loading = signal(true);
  notFound = signal(false);
  posting = signal(false);
  reviewError = signal<string | null>(null);

  draft = { visitorName: '', rating: 0, comment: '' };

  credit = computed(() => photoCreditFor(this.place()?.imageUrl));

  visibleReviews = computed(() => (this.showAllReviews() ? this.reviews() : this.reviews().slice(0, VISIBLE_REVIEWS)));

  distribution = computed(() => {
    const reviews = this.reviews();
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = reviews.filter((r) => r.rating === stars).length;
      return { stars, count, percent: reviews.length ? Math.round((count / reviews.length) * 100) : 0 };
    });
  });

  nearby = computed(() => {
    const current = this.place();
    if (!current) return [];
    return this.allPlaces()
      .filter((p) => p.id !== current.id)
      .map((p) => {
        const km = estimateRoadKm(current, p);
        return { place: p, km, minutes: estimateTravelMinutes(km) };
      })
      .sort((a, b) => a.km - b.km)
      .slice(0, 3);
  });

  ngOnInit(): void {
    this.placeService.getAll().subscribe({ next: (places) => this.allPlaces.set(places) });

    // Re-load when navigating between places (the component instance is reused).
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = Number(params.get('id'));
      this.loading.set(true);
      this.notFound.set(false);
      this.place.set(null);
      this.reviews.set([]);
      this.showAllReviews.set(false);
      this.reviewError.set(null);
      this.placeService.getById(id).subscribe({
        next: (place) => {
          this.place.set(place);
          this.loading.set(false);
          window.scrollTo({ top: 0 });
        },
        error: () => {
          this.notFound.set(true);
          this.loading.set(false);
        }
      });
      this.reviewService.getForPlace(id).subscribe({ next: (reviews) => this.reviews.set(reviews), error: () => this.reviews.set([]) });
    });
  }

  submitReview(): void {
    const p = this.place();
    if (!p) return;
    if (this.draft.rating < 1) {
      this.reviewError.set(this.i18n.t('reviews.pickRating'));
      return;
    }
    this.posting.set(true);
    this.reviewError.set(null);

    this.reviewService
      .create(p.id, { visitorName: this.draft.visitorName.trim(), rating: this.draft.rating, comment: this.draft.comment.trim() })
      .subscribe({
        next: (review) => {
          this.posting.set(false);
          this.reviews.set([review, ...this.reviews()]);
          const count = p.reviewCount + 1;
          const average = ((p.averageRating ?? 0) * p.reviewCount + review.rating) / count;
          this.place.set({ ...p, reviewCount: count, averageRating: Math.round(average * 10) / 10 });
          this.draft = { visitorName: this.draft.visitorName, rating: 0, comment: '' };
          this.toast.show(this.i18n.t('reviews.thanks'), 'bi-chat-heart');
        },
        error: (err: HttpErrorResponse) => {
          this.posting.set(false);
          this.reviewError.set(this.i18n.t(err.status === 429 ? 'reviews.rateLimited' : 'reviews.error'));
        }
      });
  }

  reviewCountLabel(n: number): string {
    return n === 1 ? this.i18n.t('reviews.countOne') : this.i18n.t('reviews.count', { n });
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => [...part][0]?.toUpperCase() ?? '')
      .join('');
  }

  directionsUrl(p: Place): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
  }

  isInPlan(): boolean {
    const p = this.place();
    return p ? this.visitPlan.isInPlan(p.id) : false;
  }

  isNearbyInPlan(p: Place): boolean {
    return this.visitPlan.isInPlan(p.id);
  }

  toggleInPlan(p: Place | null = this.place()): void {
    if (!p) return;
    const adding = !this.visitPlan.isInPlan(p.id);
    this.visitPlan.toggle(p);
    this.toast.show(this.i18n.t(adding ? 'toast.added' : 'toast.removed', { name: this.i18n.placeName(p) }), adding ? 'bi-check2-circle' : 'bi-dash-circle');
  }
}
