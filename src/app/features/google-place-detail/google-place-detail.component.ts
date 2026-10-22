import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GooglePlaceDetails, GooglePlacesService } from '../../core/services/google-places.service';
import { VisitPlanService, planDistrictOf } from '../../core/services/visit-plan.service';
import { DistrictService } from '../../core/services/district.service';
import { UserLocationService } from '../../core/services/user-location.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { categoryIcon } from '../../core/models/category-meta';
import { externalToPlace, planKey } from '../../core/utils/place-ref';
import { PhotoFallbackService } from '../../core/services/photo-fallback.service';
import { RestrictionService } from '../../core/services/restriction.service';
import { AuthService } from '../../core/services/auth.service';
import { FadeImageDirective } from '../../shared/fade-image/fade-image.directive';
import { nearestDistrict } from '../../core/utils/map-places';
import { googleMapsDirectionsUrl } from '../../core/utils/geo';
import { MapComponent } from '../../shared/map/map.component';
import { StarRatingComponent } from '../../shared/star-rating/star-rating.component';

/** Details of a Google place, fetched live from Google Places (only the place ID is ever stored). */
@Component({
  selector: 'app-google-place-detail',
  standalone: true,
  imports: [RouterLink, MapComponent, StarRatingComponent, FadeImageDirective],
  templateUrl: './google-place-detail.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  // Same layout as our own place pages.
  styleUrl: '../place-detail/place-detail.component.css'
})
export class GooglePlaceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private googlePlaces = inject(GooglePlacesService);
  private visitPlan = inject(VisitPlanService);
  private districts = inject(DistrictService);
  private userLocation = inject(UserLocationService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  readonly i18n = inject(I18nService);
  readonly categoryIcon = categoryIcon;

  status = signal<'loading' | 'ready' | 'notFound' | 'unavailable'>('loading');
  details = signal<GooglePlaceDetails | null>(null);

  /** The place as a plan stop / map pin, in the district whose capital is nearest. */
  asPlace = computed(() => {
    const d = this.details();
    if (!d) return null;
    return externalToPlace(d.place, nearestDistrict(this.districts.districts(), d.place)?.code);
  });

  private photoFallback = inject(PhotoFallbackService);
  private restrictions = inject(RestrictionService);
  private auth = inject(AuthService);

  morePhotos = computed(() => this.details()?.photos.slice(1) ?? []);

  /** Google's first photo, or a Wikimedia photo when Google has none. */
  heroPhoto = computed(() => {
    const d = this.details();
    const place = this.asPlace();
    if (!d || !place) return null;
    if (d.photos[0]) return d.photos[0];
    const wiki = this.photoFallback.photoFor(planKey(place));
    return wiki ? { url: wiki.url, credit: { name: wiki.author, url: wiki.pageUrl, license: wiki.license } } : null;
  });

  /** A Wikimedia lookup is running for the hero photo. */
  heroPending = computed(() => {
    const place = this.asPlace();
    return !!place && !this.heroPhoto() && this.photoFallback.isPending(planKey(place));
  });

  constructor() {
    effect(() => {
      const d = this.details();
      const place = this.asPlace();
      if (d && place && d.photos.length === 0) {
        untracked(() => this.photoFallback.request([{ key: planKey(place), name: place.name, latitude: place.latitude, longitude: place.longitude }]));
      }
    });
  }

  ngOnInit(): void {
    this.districts.load();
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => void this.load(params.get('placeId') ?? ''));
  }

  async load(placeId: string): Promise<void> {
    this.status.set('loading');
    this.details.set(null);
    await this.restrictions.load();
    try {
      const details = await this.googlePlaces.details(placeId);
      // A place the administrator has hidden — directly, or as a copy of one of our hidden places — does not
      // exist for visitors (admins can still open it).
      if (details && this.restrictions.isRestricted(details.place) && !this.auth.isLoggedIn()) {
        this.status.set('notFound');
        return;
      }
      this.details.set(details);
      this.status.set(details ? 'ready' : 'notFound');
    } catch (error) {
      // 503: the backend has no Google key; otherwise Google did not answer.
      this.status.set(error instanceof HttpErrorResponse && error.status === 503 ? 'unavailable' : 'notFound');
    }
  }

  isInPlan(): boolean {
    const place = this.asPlace();
    return place ? this.visitPlan.isInPlan(place) : false;
  }

  toggleInPlan(): void {
    const place = this.asPlace();
    if (!place) return;
    const adding = !this.visitPlan.isInPlan(place);
    this.visitPlan.toggle(place);
    const district = this.districts.byCode(planDistrictOf(place));
    const area = district ? this.i18n.districtName(district) : this.i18n.t('area.homeShort');
    this.toast.show(this.i18n.t(adding ? 'toast.addedTo' : 'toast.removedFrom', { name: place.name, area }), adding ? 'bi-check2-circle' : 'bi-dash-circle');
  }

  directionsUrl(): string {
    const d = this.details();
    return d ? googleMapsDirectionsUrl(d.place, this.userLocation.origin()) : '';
  }
}
