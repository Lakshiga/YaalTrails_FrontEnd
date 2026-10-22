import { ENV } from '../../environments/env.generated';

/** The backend API, from .env (NG_APP_API_BASE_URL). The browser talks only to this API — never to Google directly. */
export const API_BASE_URL: string = ENV.apiBaseUrl;

/**
 * Map tile source. The public OpenStreetMap server is free for light use only
 * (https://operations.osmfoundation.org/policies/tiles/) — tiles are loaded on demand, never prefetched.
 * Point this at another provider or a self-hosted server for heavier traffic.
 */
export const MAP_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  maxZoom: 19
};
