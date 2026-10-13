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
