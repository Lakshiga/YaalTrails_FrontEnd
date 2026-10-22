import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { HOME_LOCATION } from '../models/home-reference';
import { LatLng, haversineKm, roundKm } from '../utils/geo';
import { isInSriLanka } from '../utils/map-places';

/** The browser geolocation API, or null where unsupported. Replaced in tests. */
export const GEOLOCATION = new InjectionToken<Geolocation | null>('GEOLOCATION', {
  providedIn: 'root',
  factory: () => (typeof navigator !== 'undefined' && navigator.geolocation) || null
});

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable' | 'unsupported';

// GeolocationPositionError.PERMISSION_DENIED
const PERMISSION_DENIED = 1;

/**
 * The visitor's position, requested only when they ask for it.
 * Kept in memory for this tab — never stored or sent to the backend.
 */
@Injectable({ providedIn: 'root' })
export class UserLocationService {
  private geolocation = inject(GEOLOCATION);

  readonly status = signal<LocationStatus>('idle');
  readonly position = signal<LatLng | null>(null);

  /** Straight-line km from Jaffna town, or null before a position is known. */
  readonly kmFromHome = computed(() => {
    const position = this.position();
    return position ? roundKm(haversineKm(HOME_LOCATION, position)) : null;
  });

  readonly insideSriLanka = computed(() => {
    const position = this.position();
    return position !== null && isInSriLanka(position);
  });

  /** The position to measure distances from — only when it lies inside Sri Lanka, the area the system covers. */
  readonly origin = computed(() => (this.insideSriLanka() ? this.position() : null));

  locate(): void {
    void this.requestPosition();
  }

  /** Asks for the visitor's position; resolves with it, or null when unsupported, denied or unavailable. */
  requestPosition(): Promise<LatLng | null> {
    return new Promise((resolve) => {
      if (!this.geolocation) {
        this.status.set('unsupported');
        resolve(null);
        return;
      }
      this.status.set('locating');
      this.geolocation.getCurrentPosition(
        (pos) => {
          const position = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          this.position.set(position);
          this.status.set('ready');
          resolve(position);
        },
        (error) => {
          this.position.set(null);
          this.status.set(error.code === PERMISSION_DENIED ? 'denied' : 'unavailable');
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  clear(): void {
    this.position.set(null);
    this.status.set('idle');
  }
}
