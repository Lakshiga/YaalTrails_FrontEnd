import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { ENV } from '../../../environments/env.generated';

/** 'google' when the Google Maps JavaScript API loaded with a valid key; 'leaflet' = OpenStreetMap fallback. */
export type MapProvider = 'loading' | 'google' | 'leaflet';

export interface MapsConfig {
  /** Browser key for the Maps JavaScript API (map drawing only), from .env. Empty = OpenStreetMap. */
  googleMapsApiKey: string;
  googleMapId: string;
}

/** The browser map settings — read from .env at build time, never fetched from the backend. Replaced in tests. */
export const GOOGLE_MAPS_CONFIG = new InjectionToken<MapsConfig>('GOOGLE_MAPS_CONFIG', {
  providedIn: 'root',
  factory: () => ({ googleMapsApiKey: ENV.googleMapsApiKey, googleMapId: ENV.googleMapId })
});

/** Adds the Google Maps script to the page and resolves once `google.maps` is usable. Replaced in tests. */
export const GOOGLE_MAPS_SCRIPT_LOADER = new InjectionToken<(src: string) => Promise<void>>('GOOGLE_MAPS_SCRIPT_LOADER', {
  providedIn: 'root',
  factory: () => loadScript
});

const CALLBACK = '__yaalGoogleMapsReady';

/**
 * Google Maps errors that leave the map unusable ("This page can't load Google Maps correctly").
 * Google only reports most of them in the browser console — gm_authFailure is not called for billing errors.
 * https://developers.google.com/maps/documentation/javascript/error-messages
 */
export const FATAL_MAP_ERRORS = [
  'BillingNotEnabledMapError',
  'ApiNotActivatedMapError',
  'InvalidKeyMapError',
  'MissingKeyMapError',
  'ExpiredKeyMapError',
  'RefererNotAllowedMapError',
  'ApiProjectMapError',
  'DeletedApiProjectMapError',
  'ProjectDeniedMapError'
];

/** The fatal error code in a console message from Google Maps, or null. */
export function fatalMapError(message: string): string | null {
  const code = /Google Maps JavaScript API error: (\w+)/.exec(message)?.[1];
  return code && FATAL_MAP_ERRORS.includes(code) ? code : null;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    w[CALLBACK] = () => resolve();
    const script = document.createElement('script');
    script.src = `${src}&callback=${CALLBACK}`;
    script.async = true;
    script.onerror = () => reject(new Error('Google Maps script failed to load'));
    document.head.appendChild(script);
  });
}

/**
 * Loads the Google Maps JavaScript API to draw maps (maps + markers only), with the browser key from .env.
 * Places, routes and photos come from our backend, not from this script. Without a key, or when Google rejects
 * it, the site keeps working on OpenStreetMap.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private config = inject(GOOGLE_MAPS_CONFIG);
  private loadScriptFn = inject(GOOGLE_MAPS_SCRIPT_LOADER);
  private started: Promise<boolean> | null = null;

  readonly provider = signal<MapProvider>('loading');
  /** Map ID needed for Advanced Markers ("DEMO_MAP_ID" works for development). */
  mapId = 'DEMO_MAP_ID';

  /** Starts loading once; resolves true when Google Maps is ready to use. */
  load(): Promise<boolean> {
    this.started ??= this.start();
    return this.started;
  }

  /** Called when Google rejects the key while the page is open (bad key, API not enabled, wrong referrer). */
  fallBackToOpenStreetMap(reason: string): void {
    console.warn(`Google Maps unavailable (${reason}); using OpenStreetMap instead.`);
    this.provider.set('leaflet');
  }

  private watchConsoleForMapErrors(): void {
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      const code = fatalMapError(args.map(String).join(' '));
      if (code && this.provider() !== 'leaflet') this.fallBackToOpenStreetMap(code);
      original(...args);
    };
  }

  private async start(): Promise<boolean> {
    try {
      const config = this.config;
      if (!config.googleMapsApiKey) {
        this.provider.set('leaflet');
        return false;
      }
      this.mapId = config.googleMapId || 'DEMO_MAP_ID';
      // Google calls this global when the key is invalid or not allowed for this site...
      (window as unknown as Record<string, unknown>)['gm_authFailure'] = () => this.fallBackToOpenStreetMap('key rejected');
      // ...but reports other fatal problems (e.g. billing not enabled) only in the console.
      this.watchConsoleForMapErrors();
      const params = new URLSearchParams({ key: config.googleMapsApiKey, v: 'weekly', loading: 'async', region: 'LK' });
      await this.loadScriptFn(`https://maps.googleapis.com/maps/api/js?${params}`);
      await Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')]);
      if (this.provider() === 'loading') this.provider.set('google');
      return this.provider() === 'google';
    } catch {
      this.provider.set('leaflet');
      return false;
    }
  }
}
