import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, timeout } from 'rxjs';
import { API_BASE_URL } from '../config';
import { LatLng } from '../utils/geo';

/** The backend routes through at most this many points per request. */
export const MAX_ROUTE_POINTS = 25;

export interface RoadLeg {
  km: number;
  minutes: number;
}

export interface RoadRoute {
  legs: RoadLeg[];
  /** [lat, lng] pairs along the road, ready for either map. */
  geometry: [number, number][];
  /** Who calculated the route. */
  provider: 'google' | 'osrm';
}

interface DurationMatrix {
  /** Seconds between every pair of points; -1 where there is no route. */
  durations: number[][];
  provider: 'google' | 'osrm';
}

function body(points: LatLng[]) {
  return { points: points.map((p) => ({ latitude: p.latitude, longitude: p.longitude })) };
}

function key(points: LatLng[]): string {
  return points.map((p) => `${p.longitude.toFixed(5)},${p.latitude.toFixed(5)}`).join(';');
}

/**
 * Driving routes and travel times from our backend, which asks Google Routes API (when configured) or the public
 * OSRM server. The browser never calls a routing service directly.
 */
@Injectable({ providedIn: 'root' })
export class RoutingService {
  private http = inject(HttpClient);
  private baseUrl = `${API_BASE_URL}/routing`;
  private cache = new Map<string, Observable<RoadRoute | null>>();

  /** Driving route through the points in order, or null when routing is unavailable. */
  route(points: LatLng[]): Observable<RoadRoute | null> {
    if (points.length < 2 || points.length > MAX_ROUTE_POINTS) return of(null);
    const id = key(points);
    if (!this.cache.has(id)) {
      const request = this.http.post<RoadRoute>(`${this.baseUrl}/route`, body(points)).pipe(
        timeout(20000),
        catchError(() => {
          this.cache.delete(id); // failures are not cached
          return of(null);
        }),
        shareReplay(1)
      );
      this.cache.set(id, request);
    }
    return this.cache.get(id)!;
  }

  /** Matrix of driving durations in seconds between all points, or null when unavailable. */
  durations(points: LatLng[]): Observable<number[][] | null> {
    if (points.length < 2 || points.length > MAX_ROUTE_POINTS) return of(null);
    return this.http.post<DurationMatrix>(`${this.baseUrl}/matrix`, body(points)).pipe(
      timeout(20000),
      map((res) => res.durations.map((row) => row.map((d) => (d < 0 ? Number.POSITIVE_INFINITY : d)))),
      catchError(() => of(null))
    );
  }
}
