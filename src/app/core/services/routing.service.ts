import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, timeout } from 'rxjs';
import { LatLng } from '../utils/geo';

// Public OSRM demo server: fine for coursework/demo traffic, not for production load.
const OSRM_BASE = 'https://router.project-osrm.org';

export interface RoadLeg {
  km: number;
  minutes: number;
}

export interface RoadRoute {
  legs: RoadLeg[];
  /** [lat, lng] pairs along the road, ready for Leaflet. */
  geometry: [number, number][];
}

interface OsrmRouteResponse {
  code: string;
  routes: { geometry: { coordinates: [number, number][] }; legs: { distance: number; duration: number }[] }[];
}

interface OsrmTableResponse {
  code: string;
  durations: (number | null)[][];
}

function coords(points: LatLng[]): string {
  return points.map((p) => `${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}`).join(';');
}

@Injectable({ providedIn: 'root' })
export class RoutingService {
  private http = inject(HttpClient);
  private cache = new Map<string, Observable<RoadRoute | null>>();

  /** Driving route through the points in order, or null when routing is unavailable. */
  route(points: LatLng[]): Observable<RoadRoute | null> {
    if (points.length < 2) return of(null);
    const key = coords(points);
    if (!this.cache.has(key)) {
      const request = this.http
        .get<OsrmRouteResponse>(`${OSRM_BASE}/route/v1/driving/${key}`, {
          params: { overview: 'full', geometries: 'geojson', steps: 'false' }
        })
        .pipe(
          timeout(10000),
          map((res) => {
            if (res.code !== 'Ok' || !res.routes.length) return null;
            const route = res.routes[0];
            return {
              legs: route.legs.map((leg) => ({
                km: Math.round(leg.distance / 100) / 10,
                minutes: Math.max(leg.distance > 50 ? 1 : 0, Math.round(leg.duration / 60))
              })),
              geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number])
            };
          }),
          catchError(() => of(null)),
          shareReplay(1)
        );
      this.cache.set(key, request);
    }
    return this.cache.get(key)!;
  }

  /** Matrix of driving durations in seconds between all points, or null when unavailable. */
  durations(points: LatLng[]): Observable<number[][] | null> {
    return this.http
      .get<OsrmTableResponse>(`${OSRM_BASE}/table/v1/driving/${coords(points)}`, { params: { annotations: 'duration' } })
      .pipe(
        timeout(10000),
        map((res) => (res.code === 'Ok' ? res.durations.map((row) => row.map((d) => d ?? Number.POSITIVE_INFINITY)) : null)),
        catchError(() => of(null))
      );
  }
}
