import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../config';
import { ExternalPlace, ExternalSource } from '../models/district.model';
import { Place } from '../models/place.model';
import { samePlaceScore } from '../utils/map-places';

/** A Google / OpenStreetMap place the administrator has hidden from visitors. */
export interface RestrictedPlace {
  id: number;
  source: ExternalSource;
  externalId: string;
  name: string;
  latitude: number;
  longitude: number;
  district: string;
  createdAtUtc: string;
}

/** One of our places the administrator has hidden (only what is needed to recognise Google's copy of it). */
export interface HiddenOurPlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

interface RestrictionsResponse {
  places: RestrictedPlace[];
  hiddenPlaces: HiddenOurPlace[];
}

const key = (source: string, id: string) => `${source}:${id}`;

/**
 * The administrator's list of hidden Google / OpenStreetMap places, loaded once and shared, so every page
 * (home, map, planner, place pages) can leave them out.
 */
@Injectable({ providedIn: 'root' })
export class RestrictionService {
  private http = inject(HttpClient);
  private baseUrl = `${API_BASE_URL}/restricted-places`;
  private request: Promise<void> | null = null;

  /** Hidden Google / OpenStreetMap places. */
  readonly list = signal<RestrictedPlace[]>([]);
  /** Our own hidden places: Google copies of them are hidden too. */
  readonly hiddenOurs = signal<HiddenOurPlace[]>([]);
  private readonly keys = computed(() => new Set(this.list().map((r) => key(r.source, r.externalId))));

  /** Loads the list once; resolves when it has arrived (or failed — then nothing is hidden). */
  load(): Promise<void> {
    this.request ??= firstValueFrom(this.http.get<RestrictionsResponse>(this.baseUrl))
      .then((res) => {
        this.list.set(res.places ?? []);
        this.hiddenOurs.set(res.hiddenPlaces ?? []);
      })
      .catch(() => {
        this.request = null; // try again next time
      });
    return this.request;
  }

  /** Hidden by its own id, or because it is a copy of one of our hidden places. */
  isRestricted(place: Pick<ExternalPlace, 'source' | 'id'> & Partial<Pick<ExternalPlace, 'name' | 'latitude' | 'longitude'>>): boolean {
    if (this.keys().has(key(place.source, place.id))) return true;
    return this.matchesHiddenOurs(place);
  }

  /** True for a plan stop that is a hidden Google / OpenStreetMap place. */
  isRestrictedStop(place: Place): boolean {
    return !!place.external && this.isRestricted({ source: place.external.source, id: place.external.id, name: place.name, latitude: place.latitude, longitude: place.longitude });
  }

  /** Our hidden place this external place is a copy of, if any. */
  hiddenOurMatch(place: Partial<Pick<ExternalPlace, 'name' | 'latitude' | 'longitude'>>): HiddenOurPlace | null {
    if (!place.name || place.latitude === undefined || place.longitude === undefined) return null;
    const external = { name: place.name, latitude: place.latitude, longitude: place.longitude };
    return this.hiddenOurs().find((h) => samePlaceScore(external, h) > 0) ?? null;
  }

  /** Called by the admin pages after hiding or showing one of our places. */
  setHiddenOurs(places: HiddenOurPlace[]): void {
    this.hiddenOurs.set(places);
  }

  private matchesHiddenOurs(place: Partial<Pick<ExternalPlace, 'name' | 'latitude' | 'longitude'>>): boolean {
    return this.hiddenOurMatch(place) !== null;
  }

  /** Administrator: hide a place from visitors. */
  async restrict(place: ExternalPlace, district: string): Promise<void> {
    const saved = await firstValueFrom(
      this.http.post<RestrictedPlace>(this.baseUrl, {
        source: place.source,
        externalId: place.id,
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        district
      })
    );
    this.list.update((list) => [saved, ...list.filter((r) => r.id !== saved.id)]);
  }

  /** Administrator: show a hidden place to visitors again. */
  async unrestrict(restricted: RestrictedPlace): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${restricted.id}`));
    this.list.update((list) => list.filter((r) => r.id !== restricted.id));
  }

  /** The list entry for an external place, if it is hidden. */
  entryFor(place: Pick<ExternalPlace, 'source' | 'id'>): RestrictedPlace | null {
    return this.list().find((r) => r.source === place.source && r.externalId === place.id) ?? null;
  }
}
