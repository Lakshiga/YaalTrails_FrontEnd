export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Straight-line distance in km between two points (Haversine formula). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rounds a distance to 0.1 km. */
export function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}

/**
 * True when a point has usable coordinates. (0, 0) counts as "not set" — it is what a missing
 * value defaults to, and it lies in the Atlantic, nowhere near Jaffna.
 */
export function hasValidCoordinates(point: Partial<LatLng> | null | undefined): point is LatLng {
  if (!point) return false;
  const { latitude, longitude } = point;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

/** True when point lies within radiusKm (straight line) of center. */
export function isWithinRadius(center: LatLng, point: LatLng, radiusKm: number): boolean {
  return roundKm(haversineKm(center, point)) <= radiusKm;
}

/**
 * Google Maps directions link — opens the Google Maps website or app, no API key needed.
 * Without an origin, Google starts from the device's current location.
 */
export function googleMapsDirectionsUrl(destination: LatLng, origin?: LatLng | null): string {
  let url = `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`;
  if (origin) url += `&origin=${origin.latitude},${origin.longitude}`;
  return url;
}

// Roads are rarely straight: scale straight-line distance and assume an average local speed.
const ROAD_FACTOR = 1.3;
const AVERAGE_SPEED_KMH = 30;

/** Estimated road distance in km, rounded to 0.1. */
export function estimateRoadKm(a: LatLng, b: LatLng): number {
  return Math.round(haversineKm(a, b) * ROAD_FACTOR * 10) / 10;
}

/** Estimated driving time in minutes for a road distance, at least 5 minutes for any move. */
export function estimateTravelMinutes(roadKm: number): number {
  if (roadKm < 0.05) return 0;
  return Math.max(5, Math.round((roadKm / AVERAGE_SPEED_KMH) * 60));
}
