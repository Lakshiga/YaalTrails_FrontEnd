import { Injectable, inject, signal } from '@angular/core';
import { Place } from '../models/place.model';
import { HoursInfo, WeeklyPeriod, hoursFromWeeklyPeriods, parseOpeningHours } from '../utils/opening-hours';
import { GooglePlacesService } from './google-places.service';

/**
 * Opening hours of plan stops on a given weekday: our places' hours text is parsed; Google places use
 * Google's weekly periods, fetched once per place and kept for the session.
 */
@Injectable({ providedIn: 'root' })
export class OpeningHoursService {
  private googlePlaces = inject(GooglePlacesService);
  private requested = new Set<string>();

  /** Google place id → weekly periods (null = Google lists no hours). Missing = not loaded yet. */
  private readonly weekly = signal<Record<string, WeeklyPeriod[] | null>>({});

  /** Loads Google hours for the plan's Google stops (each place once). */
  request(places: Place[]): void {
    for (const place of places) {
      const id = place.external?.source === 'google' ? place.external.id : null;
      if (!id || this.requested.has(id)) continue;
      this.requested.add(id);
      void this.load(id);
    }
  }

  /** The place's hours on the weekday (0 = Sunday). */
  infoFor(place: Place, weekday: number): HoursInfo {
    if (place.external?.source === 'google') {
      const periods = this.weekly()[place.external.id];
      return periods === undefined ? { kind: 'unknown' } : hoursFromWeeklyPeriods(periods, weekday);
    }
    return parseOpeningHours(place.openingHours, weekday);
  }

  private async load(placeId: string): Promise<void> {
    try {
      const periods = await this.googlePlaces.weeklyHours(placeId);
      this.weekly.update((all) => ({ ...all, [placeId]: periods }));
    } catch {
      this.requested.delete(placeId); // try again next time
    }
  }
}
