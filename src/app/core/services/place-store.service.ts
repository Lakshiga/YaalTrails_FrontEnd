import { Injectable, computed, inject, signal } from '@angular/core';
import { Place } from '../models/place.model';
import { PlaceService } from './place.service';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Our places from the database, loaded once and shared by every page (home, map, planner, details).
 * Call refresh() after the data changes (the admin pages do).
 */
@Injectable({ providedIn: 'root' })
export class PlaceStore {
  private api = inject(PlaceService);
  private inflight: Promise<Place[]> | null = null;

  readonly places = signal<Place[]>([]);
  readonly status = signal<LoadStatus>('idle');
  readonly loading = computed(() => this.status() === 'loading' || this.status() === 'idle');
  readonly failed = computed(() => this.status() === 'error');

  /** Loads the places unless they are already loaded or loading. */
  load(): void {
    if (this.status() === 'ready' || this.status() === 'loading') return;
    this.fetch();
  }

  /** Loads the places again (after an admin change, or to retry after an error). */
  refresh(): void {
    this.fetch();
  }

  /** The places once loaded (an empty list if loading fails). Starts loading if needed. */
  whenReady(): Promise<Place[]> {
    if (this.status() === 'ready') return Promise.resolve(this.places());
    this.load();
    return this.inflight ?? Promise.resolve(this.places());
  }

  byId(id: number): Place | null {
    return this.places().find((p) => p.id === id) ?? null;
  }

  /** Replaces one place with a newer copy (e.g. after a review changed its rating). */
  update(place: Place): void {
    this.places.update((places) => places.map((p) => (p.id === place.id ? place : p)));
  }

  private fetch(): void {
    this.status.set('loading');
    this.inflight = new Promise((resolve) => {
      this.api.getAll().subscribe({
        next: (places) => {
          this.places.set(places);
          this.status.set('ready');
          resolve(places);
        },
        error: () => {
          // Keep showing what we had (if anything) rather than an empty site.
          this.status.set(this.places().length > 0 ? 'ready' : 'error');
          resolve(this.places());
        }
      });
    });
  }
}
