import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminReview, Place } from '../../core/models/place.model';
import { ReviewService } from '../../core/services/review.service';
import { ExternalPlace } from '../../core/models/district.model';
import { PlaceService } from '../../core/services/place.service';
import { PlaceStore } from '../../core/services/place-store.service';
import { RestrictedPlace, RestrictionService } from '../../core/services/restriction.service';
import { samePlaceScore } from '../../core/utils/map-places';

/**
 * Admin-only state: every place in the database (hidden ones included) and the actions that change what
 * visitors see. Hiding works across sources — hiding one of our places also hides Google's copy of it on
 * visitors' pages, and hiding a Google place also hides our matching place.
 */
@Injectable({ providedIn: 'root' })
export class AdminPlacesService {
  private api = inject(PlaceService);
  private store = inject(PlaceStore);
  private restrictions = inject(RestrictionService);
  private reviewApi = inject(ReviewService);

  readonly places = signal<Place[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly visibleCount = computed(() => this.places().filter((p) => !p.isHidden).length);
  readonly hiddenPlaces = computed(() => this.places().filter((p) => p.isHidden));

  readonly reviews = signal<AdminReview[]>([]);
  readonly reviewsLoading = signal(false);

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getAll(undefined, true).subscribe({
      next: (places) => {
        this.places.set(places);
        this.loading.set(false);
        this.syncRestrictions();
        void this.hideCopiesOfRestricted();
      },
      error: () => {
        this.error.set('Could not load places. Please make sure the backend API is running.');
        this.loading.set(false);
      }
    });
  }

  loadReviews(): void {
    this.reviewsLoading.set(true);
    this.reviewApi.getAll().subscribe({
      next: (reviews) => {
        this.reviews.set(reviews);
        this.reviewsLoading.set(false);
      },
      error: () => this.reviewsLoading.set(false)
    });
  }

  async deleteReview(review: AdminReview): Promise<void> {
    await firstValueFrom(this.reviewApi.delete(review.id));
    this.reviews.update((list) => list.filter((r) => r.id !== review.id));
    this.load(); // ratings change
  }

  /** Our places a Google / OpenStreetMap place is a copy of. */
  matchesFor(external: ExternalPlace): Place[] {
    return this.places().filter((p) => samePlaceScore(external, p) > 0);
  }

  /** Hides or shows one of our places (Google's copy follows on visitors' pages). */
  async setHidden(place: Place, hidden: boolean): Promise<void> {
    const updated = await firstValueFrom(this.api.setVisibility(place.id, hidden));
    this.places.update((places) => places.map((p) => (p.id === updated.id ? updated : p)));
    this.syncRestrictions();
    this.store.refresh(); // visitors' shared list no longer contains it
  }

  /**
   * Hides a Google / OpenStreetMap place — and our places it is a copy of, so no version of it stays visible.
   * Returns the names of our places that were hidden with it.
   */
  async hideExternal(external: ExternalPlace, district: string): Promise<string[]> {
    await this.restrictions.restrict(external, district);
    const ours = this.matchesFor(external).filter((p) => !p.isHidden);
    for (const place of ours) await this.setHidden(place, true);
    return ours.map((p) => p.name);
  }

  /** Shows a Google / OpenStreetMap place again — and our matching places that are hidden. */
  async showExternal(entry: RestrictedPlace): Promise<string[]> {
    await this.restrictions.unrestrict(entry);
    const external = { name: entry.name, latitude: entry.latitude, longitude: entry.longitude };
    const ours = this.places().filter((p) => p.isHidden && samePlaceScore(external, p) > 0);
    for (const place of ours) await this.setHidden(place, false);
    return ours.map((p) => p.name);
  }

  async delete(place: Place): Promise<void> {
    await firstValueFrom(this.api.delete(place.id));
    this.places.update((places) => places.filter((p) => p.id !== place.id));
    this.syncRestrictions();
    this.store.refresh();
  }

  /**
   * Google / OpenStreetMap places hidden before cross-hiding existed may still have a visible copy among our
   * places; hide those so no version of a hidden place stays visible.
   */
  private async hideCopiesOfRestricted(): Promise<void> {
    await this.restrictions.load();
    const copies = this.places().filter(
      (p) => !p.isHidden && this.restrictions.list().some((r) => samePlaceScore(r, p) > 0)
    );
    for (const place of copies) {
      try {
        await this.setHidden(place, true);
      } catch {
        // Left visible; the admin can hide it by hand.
      }
    }
  }

  /** Keeps the shared "hidden places" list (used to hide Google copies) in step with our places. */
  private syncRestrictions(): void {
    this.restrictions.setHiddenOurs(this.hiddenPlaces().map(({ id, name, latitude, longitude }) => ({ id, name, latitude, longitude })));
  }
}
