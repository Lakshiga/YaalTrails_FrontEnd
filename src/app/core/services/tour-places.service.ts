import { Injectable, computed, effect, inject, untracked } from '@angular/core';
import { Place } from '../models/place.model';
import { JAFFNA_DISTRICT } from '../models/district.model';
import { HOME_LOCATION, SERVICE_RADIUS_KM } from '../models/home-reference';
import { PhotoCredit, TourCard } from '../models/tour-card';
import { bestScore, externalNotInList, isPopularPlace, matchExternal, selectMapPlaces } from '../utils/map-places';
import { haversineKm, isWithinRadius, roundKm } from '../utils/geo';
import { externalLink, externalToPlace, planKey } from '../utils/place-ref';
import { DistrictService } from './district.service';
import { FallbackPhoto, PhotoFallbackService } from './photo-fallback.service';
import { PlaceStore } from './place-store.service';
import { RestrictionService } from './restriction.service';

function wikiCredit(photo: FallbackPhoto): PhotoCredit {
  return { name: photo.author, url: photo.pageUrl, license: photo.license };
}

/**
 * The places of the selected area as one list — our places merged with Google (or OpenStreetMap) places,
 * duplicates removed, photos and "best" scores attached. Shared by the home and map pages, so the data is
 * fetched once: database places by PlaceStore, extra places by DistrictService (cached per area).
 */
@Injectable({ providedIn: 'root' })
export class TourPlacesService {
  private store = inject(PlaceStore);
  private districts = inject(DistrictService);
  private photoFallback = inject(PhotoFallbackService);
  private restrictions = inject(RestrictionService);

  readonly loading = this.store.loading;
  readonly failed = this.store.failed;

  constructor() {
    // Load extra places when the area changes (no-op when they are already loaded for it).
    effect(() => {
      this.districts.externalTrigger();
      untracked(() => void this.districts.loadExternal());
    });
  }

  /** Makes sure everything the list needs is loading. Safe to call from every page. */
  start(): void {
    this.store.load();
    this.districts.load();
    void this.restrictions.load();
  }

  retry(): void {
    this.store.refresh();
  }

  /** Our places in the selected area: the 25 km home area or a district. */
  readonly areaPlaces = computed(
    () => selectMapPlaces(this.store.places(), 'All', { area: this.districts.area(), home: HOME_LOCATION, radiusKm: SERVICE_RADIUS_KM }).places
  );

  /** Extra places (Google Places or OpenStreetMap) inside the selected area, minus those the admin has hidden. */
  readonly externalInArea = computed(() => {
    const external = this.districts.external();
    if (external.status !== 'ready') return [];
    const allowed = external.places.filter((o) => !this.restrictions.isRestricted(o));
    return this.districts.isHomeArea() ? allowed.filter((o) => isWithinRadius(HOME_LOCATION, o, SERVICE_RADIUS_KM)) : allowed;
  });

  /** Extra places that are not one of ours. */
  readonly extraPlaces = computed(() => externalNotInList(this.externalInArea(), this.store.places()));

  /** Every place in the area as a card (unfiltered, unsorted). */
  readonly cards = computed<TourCard[]>(() => {
    const center = this.districts.center();
    const isHome = this.districts.isHomeArea();
    const external = this.externalInArea();

    const ours: TourCard[] = this.areaPlaces().map((place) => {
      const match = matchExternal(place, external);
      const reviewed = place.reviewCount > 0;
      const usesGooglePhoto = !place.imageUrl && !!match?.photoUrl;
      const wiki = !place.imageUrl && !match?.photoUrl ? this.photoFallback.photoFor(planKey(place)) : null;
      return {
        kind: 'ours',
        key: `ours-${place.id}`,
        photoKey: planKey(place),
        place,
        km: isHome ? place.distanceFromHomeKm : roundKm(haversineKm(center, place)),
        photoUrl: place.imageUrl || match?.photoUrl || wiki?.url || null,
        photoCredit: usesGooglePhoto ? (match?.photoCredit ?? null) : wiki ? wikiCredit(wiki) : null,
        googleRating: reviewed ? null : (match?.rating ?? null),
        googleRatingCount: reviewed ? null : (match?.ratingCount ?? null),
        score: bestScore({
          popular: isPopularPlace(place),
          rating: reviewed ? place.averageRating : match?.rating,
          ratingCount: reviewed ? place.reviewCount : match?.ratingCount
        })
      };
    });

    const district = this.districts.district()?.code ?? JAFFNA_DISTRICT;
    const extra: TourCard[] = this.extraPlaces().map((place) => {
      const planPlace = externalToPlace(place, district);
      const wiki = place.photoUrl ? null : this.photoFallback.photoFor(planKey(planPlace));
      return {
        kind: 'external' as const,
        key: `ext-${place.id}`,
        photoKey: planKey(planPlace),
        place,
        planPlace,
        photoUrl: place.photoUrl || wiki?.url || null,
        photoCredit: place.photoUrl ? (place.photoCredit ?? null) : wiki ? wikiCredit(wiki) : null,
        link: externalLink(place),
        km: roundKm(haversineKm(center, place)),
        score: bestScore({ popular: false, rating: place.rating, ratingCount: place.ratingCount })
      };
    });

    return [...ours, ...extra];
  });

  /** The card as a Place — for map pins and the day plan — carrying the card's photo. */
  asPlace(card: TourCard): Place {
    const place = card.kind === 'ours' ? card.place : card.planPlace;
    return card.photoUrl && card.photoUrl !== place.imageUrl ? { ...place, imageUrl: card.photoUrl } : place;
  }

  /** A Wikimedia lookup is still running for the card. */
  photoPending(card: TourCard): boolean {
    return !card.photoUrl && this.photoFallback.isPending(card.photoKey);
  }

  /** Asks Wikimedia for photos of cards that have none, in the order given (top of the page first). */
  requestPhotos(cards: TourCard[]): void {
    this.photoFallback.request(
      cards
        .filter((c) => !c.photoUrl)
        .map((c) => ({ key: c.photoKey, name: c.place.name, latitude: c.place.latitude, longitude: c.place.longitude }))
    );
  }
}
