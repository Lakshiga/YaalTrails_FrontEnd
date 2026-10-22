import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlaceService } from '../../core/services/place.service';
import { PlaceStore } from '../../core/services/place-store.service';
import { ReviewService } from '../../core/services/review.service';
import { VisitPlanService, planDistrictOf } from '../../core/services/visit-plan.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { Place, Review } from '../../core/models/place.model';
import { MapComponent } from '../../shared/map/map.component';
import { StarRatingComponent } from '../../shared/star-rating/star-rating.component';
import { categoryIcon } from '../../core/models/category-meta';
import { photoCreditFor } from '../../core/models/photo-credits';
import { PhotoFallbackService } from '../../core/services/photo-fallback.service';
import { FadeImageDirective } from '../../shared/fade-image/fade-image.directive';
import { planKey } from '../../core/utils/place-ref';
import { UserLocationService } from '../../core/services/user-location.service';
import { estimateRoadKm, estimateTravelMinutes, googleMapsDirectionsUrl, haversineKm, roundKm } from '../../core/utils/geo';
import { DistrictService } from '../../core/services/district.service';
import { JAFFNA_DISTRICT } from '../../core/models/district.model';

const VISIBLE_REVIEWS = 5;

@Component({
  selector: 'app-place-detail',
  standalone: true,
  imports: [RouterLink, FormsModule, MapComponent, StarRatingComponent, FadeImageDirective],
  templateUrl: './place-detail.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './place-detail.component.css'
})
export class PlaceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private placeService = inject(PlaceService);
  private store = inject(PlaceStore);
  private reviewService = inject(ReviewService);
  private visitPlan = inject(VisitPlanService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private userLocation = inject(UserLocationService);
  readonly districts = inject(DistrictService);
  readonly i18n = inject(I18nService);

  readonly categoryIcon = categoryIcon;

  place = signal<Place | null>(null);
  /** All our places (shared state) — for the nearby suggestions. */
  allPlaces = this.store.places;
  reviews = signal<Review[]>([]);
  showAllReviews = signal(false);
  loading = signal(true);
  notFound = signal(false);
  posting = signal(false);
  reviewError = signal<string | null>(null);

  draft = { visitorName: '', rating: 0, comment: '' };

  private photoFallback = inject(PhotoFallbackService);

  /** Wikimedia photo for places without one of their own. */
  private wikiPhoto = computed(() => {
    const place = this.place();
    return place && !place.imageUrl ? this.photoFallback.photoFor(planKey(place)) : null;
  });

  heroImage = computed(() => this.place()?.imageUrl || this.wikiPhoto()?.url || null);

  /** A Wikimedia lookup is running for the hero photo. */
  heroPending = computed(() => {
    const place = this.place();
    return !!place && !this.heroImage() && this.photoFallback.isPending(planKey(place));
  });

  credit = computed(() => {
    const wiki = this.wikiPhoto();
    return (
      photoCreditFor(this.place()?.imageUrl) ??
      (wiki ? { image: wiki.url, author: wiki.author, license: wiki.license, source: wiki.pageUrl } : undefined)
    );
  });

  constructor() {
    effect(() => {
      const place = this.place();
      if (place && !place.imageUrl) {
        untracked(() => this.photoFallback.request([{ key: planKey(place), name: place.name, latitude: place.latitude, longitude: place.longitude }]));
      }
    });
  }

  /** The place's district, and its straight-line distance from that district's main town (Jaffna town for Jaffna). */
  town = computed(() => {
    const place = this.place();
    if (!place) return null;
    const district = this.districts.byCode(place.district);
    if (!district || district.code === JAFFNA_DISTRICT) {
      return { district, name: this.i18n.t('map.home'), km: place.distanceFromHomeKm };
    }
    return {
      district,
      name: this.i18n.t('plan.districtTown', { name: this.i18n.districtName(district) }),
      km: roundKm(haversineKm(district, place))
    };
  });

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
    this.districts.load();
    this.store.load();

    // Re-load when navigating between places (the component instance is reused).
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const id = Number(params.get('id'));
      this.loading.set(true);
      this.notFound.set(false);
      this.place.set(null);
      this.reviews.set([]);
      this.showAllReviews.set(false);
      this.reviewError.set(null);
      // Use the shared copy when we have it; otherwise ask the API for just this place.
      const known = this.store.byId(id);
      if (known) {
        this.showPlace(known);
      } else {
        this.placeService.getById(id).subscribe({
          next: (place) => this.showPlace(place),
          error: () => {
            this.notFound.set(true);
            this.loading.set(false);
          }
        });
      }
      this.reviewService.getForPlace(id).subscribe({ next: (reviews) => this.reviews.set(reviews), error: () => this.reviews.set([]) });
    });
  }

  private showPlace(place: Place): void {
    this.place.set(place);
    this.loading.set(false);
    window.scrollTo({ top: 0 });
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
          const updated = { ...p, reviewCount: count, averageRating: Math.round(average * 10) / 10 };
          this.place.set(updated);
          this.store.update(updated); // other pages show the new rating without reloading
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
    return googleMapsDirectionsUrl(p, this.userLocation.origin());
  }

  isInPlan(): boolean {
    const p = this.place();
    return p ? this.visitPlan.isInPlan(p) : false;
  }

  isNearbyInPlan(p: Place): boolean {
    return this.visitPlan.isInPlan(p);
  }

  toggleInPlan(p: Place | null = this.place()): void {
    if (!p) return;
    const adding = !this.visitPlan.isInPlan(p);
    this.visitPlan.toggle(p);
    const district = this.districts.byCode(planDistrictOf(p));
    const area = district ? this.i18n.districtName(district) : this.i18n.t('area.homeShort');
    this.toast.show(this.i18n.t(adding ? 'toast.addedTo' : 'toast.removedFrom', { name: this.i18n.placeName(p), area }), adding ? 'bi-check2-circle' : 'bi-dash-circle');
  }
}
