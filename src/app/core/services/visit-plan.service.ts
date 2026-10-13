import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Place } from '../models/place.model';
import { PlaceSeedHome } from '../models/home-reference';
import { LatLng, estimateRoadKm, estimateTravelMinutes } from '../utils/geo';
import { RoadRoute, RoutingService } from './routing.service';

const STORAGE_KEY = 'jaffna_visit_plan';
const SETTINGS_KEY = 'jaffna_visit_plan_settings';

const HOME: LatLng = { latitude: PlaceSeedHome.Latitude, longitude: PlaceSeedHome.Longitude };

export function parseDurationToMinutes(text: string): number {
  const numbers = text.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length === 0) return 30;
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  // Heuristic: values <= 6 are treated as hours, otherwise minutes.
  return avg <= 6 ? Math.round(avg * 60) : Math.round(avg);
}

export interface ScheduledStop {
  place: Place;
  /** Leg that leads to this stop (from home or the previous stop). */
  travelKm: number;
  travelMinutes: number;
  arriveAt: number;
  leaveAt: number;
  visitMinutes: number;
}

export interface DaySchedule {
  stops: ScheduledStop[];
  returnLeg: { travelKm: number; travelMinutes: number; arriveAt: number } | null;
  startAt: number;
  endAt: number;
  routeKm: number;
  travelMinutes: number;
  /** True when leg times come from real road routing rather than estimates. */
  usesRoadData: boolean;
}

export type RouteStatus = 'road' | 'loading' | 'approx';

interface PlanSettings {
  startTime: string;
  returnHome: boolean;
}

/** Converts "HH:mm" to minutes after midnight. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

@Injectable({ providedIn: 'root' })
export class VisitPlanService {
  private routing = inject(RoutingService);
  private readonly road = signal<{ key: string; route: RoadRoute | null } | null>(null);
  private readonly places = signal<Place[]>(this.loadFromStorage());
  private readonly settings = signal<PlanSettings>(this.loadSettings());

  readonly plan = this.places.asReadonly();
  readonly startTime = computed(() => this.settings().startTime);
  readonly returnHome = computed(() => this.settings().returnHome);

  readonly totalVisitMinutes = computed(() =>
    this.places().reduce((sum, p) => sum + parseDurationToMinutes(p.visitDuration), 0)
  );

  readonly totalDistanceKm = computed(() =>
    Math.round(this.places().reduce((sum, p) => sum + p.distanceFromHomeKm, 0) * 10) / 10
  );

  /** Identifies the current stop order + return-leg choice, so stale road routes are ignored. */
  private readonly routeKey = computed(() => `${this.places().map((p) => p.id).join(',')}|${this.settings().returnHome ? 1 : 0}`);

  /** Road route for the current plan: undefined while unknown/loading, null when routing failed. */
  readonly roadRoute = computed<RoadRoute | null | undefined>(() => {
    const road = this.road();
    return road && road.key === this.routeKey() ? road.route : undefined;
  });

  readonly routeStatus = computed<RouteStatus>(() => {
    const route = this.roadRoute();
    return route ? 'road' : route === undefined && this.places().length > 0 ? 'loading' : 'approx';
  });

  readonly schedule = computed<DaySchedule>(() => {
    const startAt = toMinutes(this.settings().startTime);
    const roadLegs = this.roadRoute()?.legs;
    let legIndex = 0;
    const leg = (from: LatLng, to: LatLng) => {
      const road = roadLegs?.[legIndex++];
      if (road) return { km: road.km, minutes: road.minutes };
      const km = estimateRoadKm(from, to);
      return { km, minutes: estimateTravelMinutes(km) };
    };
    let clock = startAt;
    let from: LatLng = HOME;
    let routeKm = 0;
    let travelMinutes = 0;

    const stops = this.places().map((place) => {
      const { km: travelKm, minutes: legMinutes } = leg(from, place);
      const visitMinutes = parseDurationToMinutes(place.visitDuration);
      const arriveAt = clock + legMinutes;
      const leaveAt = arriveAt + visitMinutes;
      clock = leaveAt;
      from = place;
      routeKm += travelKm;
      travelMinutes += legMinutes;
      return { place, travelKm, travelMinutes: legMinutes, arriveAt, leaveAt, visitMinutes };
    });

    let returnLeg: DaySchedule['returnLeg'] = null;
    if (this.settings().returnHome && stops.length > 0) {
      const { km: travelKm, minutes: legMinutes } = leg(from, HOME);
      clock += legMinutes;
      routeKm += travelKm;
      travelMinutes += legMinutes;
      returnLeg = { travelKm, travelMinutes: legMinutes, arriveAt: clock };
    }

    return {
      stops,
      returnLeg,
      startAt,
      endAt: clock,
      routeKm: Math.round(routeKm * 10) / 10,
      travelMinutes,
      usesRoadData: !!roadLegs
    };
  });

  /** Fetches the real road route for the current plan (no-op if already loaded). */
  loadRoadRoute(): void {
    const key = this.routeKey();
    if (this.places().length === 0 || this.road()?.key === key) return;
    const points: LatLng[] = [HOME, ...this.places()];
    if (this.settings().returnHome) points.push(HOME);
    this.routing.route(points).subscribe((route) => {
      if (this.routeKey() === key) this.road.set({ key, route });
    });
  }

  isInPlan(id: number): boolean {
    return this.places().some((p) => p.id === id);
  }

  add(place: Place): void {
    if (this.isInPlan(place.id)) return;
    this.save([...this.places(), place]);
  }

  remove(id: number): void {
    this.save(this.places().filter((p) => p.id !== id));
  }

  toggle(place: Place): void {
    this.isInPlan(place.id) ? this.remove(place.id) : this.add(place);
  }

  moveUp(id: number): void {
    const list = [...this.places()];
    const index = list.findIndex((p) => p.id === id);
    if (index <= 0) return;
    [list[index - 1], list[index]] = [list[index], list[index - 1]];
    this.save(list);
  }

  moveDown(id: number): void {
    const list = [...this.places()];
    const index = list.findIndex((p) => p.id === id);
    if (index === -1 || index === list.length - 1) return;
    [list[index + 1], list[index]] = [list[index], list[index + 1]];
    this.save(list);
  }

  /**
   * Reorders stops with a nearest-neighbour walk from home, using real driving times from OSRM
   * when available and straight-line estimates otherwise.
   */
  async optimiseOrder(): Promise<void> {
    const places = this.places();
    const matrix = await firstValueFrom(this.routing.durations([HOME, ...places]));
    // Matrix index 0 is home; place i is index i + 1.
    const cost = (from: number, to: number) =>
      matrix ? matrix[from][to] : estimateRoadKm(from === 0 ? HOME : places[from - 1], places[to - 1]);

    const remaining = places.map((_, i) => i + 1);
    const ordered: Place[] = [];
    let from = 0;
    while (remaining.length > 0) {
      let best = 0;
      for (let i = 1; i < remaining.length; i++) {
        if (cost(from, remaining[i]) < cost(from, remaining[best])) best = i;
      }
      from = remaining.splice(best, 1)[0];
      ordered.push(places[from - 1]);
    }
    this.save(ordered);
  }

  replaceAll(places: Place[]): void {
    this.save(places);
  }

  /** Swaps stored copies for the latest server data, dropping places that no longer exist. */
  refreshFrom(latest: Place[]): void {
    const byId = new Map(latest.map((p) => [p.id, p]));
    const refreshed = this.places().flatMap((p) => (byId.has(p.id) ? [byId.get(p.id)!] : []));
    this.save(refreshed);
  }

  setStartTime(time: string): void {
    if (!/^\d{2}:\d{2}$/.test(time)) return;
    this.saveSettings({ ...this.settings(), startTime: time });
  }

  setReturnHome(returnHome: boolean): void {
    this.saveSettings({ ...this.settings(), returnHome });
  }

  clear(): void {
    this.save([]);
  }

  private save(places: Place[]): void {
    this.places.set(places);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
    } catch {
      // Storage may be unavailable (private mode); the plan still works for this session.
    }
  }

  private saveSettings(settings: PlanSettings): void {
    this.settings.set(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore storage failures.
    }
  }

  private loadFromStorage(): Place[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Place[]) : [];
    } catch {
      return [];
    }
  }

  private loadSettings(): PlanSettings {
    const defaults: PlanSettings = { startTime: '08:00', returnHome: true };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<PlanSettings>) } : defaults;
    } catch {
      return defaults;
    }
  }
}
