import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Place } from '../models/place.model';
import { HOME_LOCATION } from '../models/home-reference';
import { HOME_AREA, JAFFNA_DISTRICT } from '../models/district.model';
import { LatLng, estimateRoadKm, estimateTravelMinutes } from '../utils/geo';
import { RoadRoute, RoutingService } from './routing.service';
import { planKey } from '../utils/place-ref';
import { DistrictService } from './district.service';
import { OpeningHoursService } from './opening-hours.service';
import { HoursInfo, VisitCheck, checkVisit, isHoursProblem } from '../utils/opening-hours';

const STORAGE_KEY = 'yaal_day_plans';
// Before plans were kept per district there was a single plan under these keys; it is migrated once.
const OLD_PLACES_KEY = 'jaffna_visit_plan';
const OLD_SETTINGS_KEY = 'jaffna_visit_plan_settings';

/** Today's date in the visitor's time zone as YYYY-MM-DD. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Minutes after midnight right now (local time). */
export function nowMinutes(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Day of the week (0 = Sunday) of a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00`).getDay();
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && todayIso(date) === value;
}

export function parseDurationToMinutes(text: string): number {
  const numbers = text.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length === 0) return 30;
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  // Heuristic: values <= 6 are treated as hours, otherwise minutes.
  return avg <= 6 ? Math.round(avg * 60) : Math.round(avg);
}

/** The district whose day plan a place belongs to (places without one count as Jaffna). */
export function planDistrictOf(place: Pick<Place, 'district'>): string {
  return /^LK-\d\d$/.test(place.district ?? '') ? place.district : JAFFNA_DISTRICT;
}

export interface ScheduledStop {
  place: Place;
  /** Leg that leads to this stop (from home or the previous stop). */
  travelKm: number;
  travelMinutes: number;
  /** When the visit starts — after any wait for the place to open. */
  arriveAt: number;
  leaveAt: number;
  visitMinutes: number;
  /** The place's hours on the trip day, and how this visit fits them. */
  hours: HoursInfo;
  check: VisitCheck;
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
  /** Stops that are closed, or close before the visit ends. */
  hoursProblems: number;
}

export type RouteStatus = 'road' | 'loading' | 'approx';

/** A chosen start or end point of a trip: the visitor's location or a searched place. */
export interface TripPoint {
  kind: 'here' | 'place';
  /** Shown in the timeline, e.g. "My location" or "Hotel Suisse". */
  label: string;
  latitude: number;
  longitude: number;
}

/** Where the day ends: back at the start, at the last stop, the district town, or a chosen point. */
export type TripEnd = 'start' | 'none' | 'town' | TripPoint;

/** A start or end point as the schedule and map use it. */
export interface ResolvedPoint extends LatLng {
  label: string;
  /** 'town' = the district's main town. */
  kind: 'town' | 'here' | 'place';
}

/** One district's day plan. */
interface DistrictPlan {
  places: Place[];
  /** Trip date, YYYY-MM-DD. */
  date: string;
  startTime: string;
  /** Where the day starts; null = the district's main town. */
  start: TripPoint | null;
  end: TripEnd;
}

interface StoredPlans {
  /** The district whose plan the planner page shows. */
  active: string;
  plans: Record<string, DistrictPlan>;
}

/** Converts "HH:mm" to minutes after midnight. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function emptyPlan(): DistrictPlan {
  return { places: [], date: todayIso(), startTime: '08:00', start: null, end: 'start' };
}

function isTripPoint(value: unknown): value is TripPoint {
  const p = value as TripPoint;
  return !!p && typeof p === 'object' && typeof p.latitude === 'number' && typeof p.longitude === 'number' && typeof p.label === 'string';
}

/** Fills in fields missing from plans saved by older versions (they had a "return home" switch). */
function normalisePlan(plan: Partial<DistrictPlan> & { returnHome?: boolean }): DistrictPlan {
  const end: TripEnd =
    plan.end === 'start' || plan.end === 'none' || plan.end === 'town' || isTripPoint(plan.end) ? plan.end : plan.returnHome === false ? 'none' : 'start';
  return {
    places: plan.places ?? [],
    date: plan.date ?? todayIso(),
    startTime: plan.startTime ?? '08:00',
    start: isTripPoint(plan.start) ? plan.start : null,
    end
  };
}

/**
 * Day plans — one per district, so a plan never mixes districts. Adding a place puts it in its own
 * district's plan; the planner page shows the "active" plan and can switch between them.
 * Each plan starts and ends at its district's main town (Jaffna plans at Jaffna town).
 */
@Injectable({ providedIn: 'root' })
export class VisitPlanService {
  private routing = inject(RoutingService);
  private districts = inject(DistrictService);
  private hours = inject(OpeningHoursService);
  private readonly road = signal<{ key: string; route: RoadRoute | null } | null>(null);
  private readonly state = signal<StoredPlans>(this.load());

  /** District code of the plan being viewed. */
  readonly activeDistrict = computed(() => this.state().active);
  private readonly active = computed(() => this.state().plans[this.state().active] ?? emptyPlan());

  readonly plan = computed(() => this.active().places);
  readonly date = computed(() => this.active().date);
  readonly startTime = computed(() => this.active().startTime);
  /** The chosen end ('start', 'none', 'town' or a point). */
  readonly end = computed(() => this.active().end);
  /** The chosen start point, or null for the district's main town. */
  readonly start = computed(() => this.active().start);
  /** True when the day ends somewhere (not at the last stop). */
  readonly returnHome = computed(() => this.active().end !== 'none');
  /** HOME_AREA for Jaffna (start at Jaffna town), otherwise the district code. */
  readonly startArea = computed(() => (this.activeDistrict() === JAFFNA_DISTRICT ? HOME_AREA : this.activeDistrict()));

  /** Districts that have a plan with stops, with their stop counts (the active one always included). */
  readonly planDistricts = computed(() => {
    const { active, plans } = this.state();
    return Object.entries(plans)
      .filter(([code, plan]) => plan.places.length > 0 || code === active)
      .map(([code, plan]) => ({ code, count: plan.places.length }))
      .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  });

  /** Stops across every district's plan. */
  readonly totalCount = computed(() => Object.values(this.state().plans).reduce((sum, p) => sum + p.places.length, 0));

  /** The active district's main town (Jaffna town for Jaffna). */
  readonly town = computed<ResolvedPoint>(() => {
    const district = this.startArea() === HOME_AREA ? null : this.districts.byCode(this.activeDistrict());
    const point = district ? { latitude: district.latitude, longitude: district.longitude } : HOME_LOCATION;
    return { ...point, kind: 'town', label: '' };
  });

  /** Where the day starts. Labels of 'town' points are filled in by the page (they need translating). */
  readonly startPoint = computed<ResolvedPoint>(() => this.active().start ?? this.town());

  /** Where the day ends, or null when it ends at the last stop. */
  readonly endPoint = computed<ResolvedPoint | null>(() => {
    const end = this.active().end;
    if (end === 'none') return null;
    if (end === 'start') return this.startPoint();
    if (end === 'town') return this.town();
    return end;
  });

  /** The start point's coordinates (for the map, weather and routing). */
  readonly startLocation = computed<LatLng>(() => {
    const { latitude, longitude } = this.startPoint();
    return { latitude, longitude };
  });

  readonly totalVisitMinutes = computed(() => this.plan().reduce((sum, p) => sum + parseDurationToMinutes(p.visitDuration), 0));

  readonly totalDistanceKm = computed(() => Math.round(this.plan().reduce((sum, p) => sum + p.distanceFromHomeKm, 0) * 10) / 10);

  /** Identifies the current stop order + return-leg choice, so stale road routes are ignored. */
  private readonly routeKey = computed(() => {
    const start = this.startLocation();
    const end = this.endPoint();
    return `${start.latitude},${start.longitude}|${this.plan().map(planKey).join(',')}|${end ? `${end.latitude},${end.longitude}` : '-'}`;
  });

  /** Road route for the current plan: undefined while unknown/loading, null when routing failed. */
  readonly roadRoute = computed<RoadRoute | null | undefined>(() => {
    const road = this.road();
    return road && road.key === this.routeKey() ? road.route : undefined;
  });

  readonly routeStatus = computed<RouteStatus>(() => {
    const route = this.roadRoute();
    return route ? 'road' : route === undefined && this.plan().length > 0 ? 'loading' : 'approx';
  });

  /** Today's plan whose start time has already passed (it can no longer be kept). */
  startTimePassed(now = new Date()): boolean {
    return this.date() === todayIso(now) && toMinutes(this.startTime()) < nowMinutes(now);
  }

  readonly schedule = computed<DaySchedule>(() => {
    const startAt = toMinutes(this.startTime());
    const weekday = weekdayOf(this.date());
    const home = this.startLocation();
    const roadLegs = this.roadRoute()?.legs;
    let legIndex = 0;
    const leg = (from: LatLng, to: LatLng) => {
      const road = roadLegs?.[legIndex++];
      if (road) return { km: road.km, minutes: road.minutes };
      const km = estimateRoadKm(from, to);
      return { km, minutes: estimateTravelMinutes(km) };
    };
    let clock = startAt;
    let from: LatLng = home;
    let routeKm = 0;
    let travelMinutes = 0;

    const stops = this.plan().map((place) => {
      const { km: travelKm, minutes: legMinutes } = leg(from, place);
      const visitMinutes = parseDurationToMinutes(place.visitDuration);
      // Arriving before the place opens means waiting for it.
      const hours = this.hours.infoFor(place, weekday);
      const check = checkVisit(hours, clock + legMinutes, visitMinutes);
      const arriveAt = clock + legMinutes + check.wait;
      const leaveAt = arriveAt + visitMinutes;
      clock = leaveAt;
      from = place;
      routeKm += travelKm;
      travelMinutes += legMinutes;
      return { place, travelKm, travelMinutes: legMinutes, arriveAt, leaveAt, visitMinutes, hours, check };
    });

    let returnLeg: DaySchedule['returnLeg'] = null;
    const end = this.endPoint();
    if (end && stops.length > 0) {
      const { km: travelKm, minutes: legMinutes } = leg(from, end);
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
      usesRoadData: !!roadLegs,
      hoursProblems: stops.filter((s) => isHoursProblem(s.check.status)).length
    };
  });

  /** Fetches the real road route for the current plan (no-op if already loaded). */
  loadRoadRoute(): void {
    const key = this.routeKey();
    if (this.plan().length === 0 || this.road()?.key === key) return;
    const home = this.startLocation();
    const end = this.endPoint();
    const points: LatLng[] = [home, ...this.plan()];
    if (end) points.push({ latitude: end.latitude, longitude: end.longitude });
    this.routing.route(points).subscribe((route) => {
      if (this.routeKey() === key) this.road.set({ key, route });
    });
  }

  /** Stops in a district's plan. */
  countFor(district: string): number {
    return this.state().plans[district]?.places.length ?? 0;
  }

  /** True when the place (ours or an external one) is already a stop in its district's plan. */
  isInPlan(place: Place): boolean {
    const key = planKey(place);
    return (this.state().plans[planDistrictOf(place)]?.places ?? []).some((p) => planKey(p) === key);
  }

  /** Adds the place to its own district's plan, which becomes the plan shown on the planner page. */
  add(place: Place): void {
    const district = planDistrictOf(place);
    if (!this.isInPlan(place)) this.updatePlan(district, (plan) => ({ ...plan, places: [...plan.places, place] }));
    this.setActive(district);
  }

  remove(place: Place): void {
    const key = planKey(place);
    this.updatePlan(planDistrictOf(place), (plan) => ({ ...plan, places: plan.places.filter((p) => planKey(p) !== key) }));
  }

  toggle(place: Place): void {
    this.isInPlan(place) ? this.remove(place) : this.add(place);
  }

  moveUp(place: Place): void {
    this.move(place, -1);
  }

  moveDown(place: Place): void {
    this.move(place, 1);
  }

  /**
   * Reorders the active plan's stops with a nearest-neighbour walk from its start, using real driving
   * times when available and straight-line estimates otherwise.
   */
  async optimiseOrder(): Promise<void> {
    const district = this.activeDistrict();
    const places = this.plan();
    const home = this.startLocation();
    const matrix = await firstValueFrom(this.routing.durations([home, ...places]));
    // Matrix index 0 is home; place i is index i + 1.
    const cost = (from: number, to: number) =>
      matrix ? matrix[from][to] : estimateRoadKm(from === 0 ? home : places[from - 1], places[to - 1]);

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
    this.updatePlan(district, (plan) => ({ ...plan, places: ordered }));
  }

  /** Replaces plans with the given places (a shared link), each in its own district's plan. */
  replaceAll(places: Place[]): void {
    const byDistrict = this.groupByDistrict(places);
    for (const [district, list] of Object.entries(byDistrict)) this.updatePlan(district, (plan) => ({ ...plan, places: list }));
    const first = places[0];
    if (first) this.setActive(planDistrictOf(first));
  }

  /** Swaps stored copies of our places for the latest server data, dropping ones that no longer exist. External stops are kept. */
  refreshFrom(latest: Place[]): void {
    const byId = new Map(latest.map((p) => [p.id, p]));
    const refreshed = (list: Place[]) => list.flatMap((p) => (p.external ? [p] : byId.has(p.id) ? [byId.get(p.id)!] : []));
    this.state.update((s) => ({
      ...s,
      plans: Object.fromEntries(Object.entries(s.plans).map(([code, plan]) => [code, { ...plan, places: refreshed(plan.places) }]))
    }));
    this.persist();
  }

  /** Removes stops matching the test from every plan (e.g. places the administrator has hidden). */
  removeWhere(test: (place: Place) => boolean): void {
    const plans = this.state().plans;
    if (!Object.values(plans).some((plan) => plan.places.some(test))) return;
    this.state.update((s) => ({
      ...s,
      plans: Object.fromEntries(Object.entries(s.plans).map(([code, plan]) => [code, { ...plan, places: plan.places.filter((p) => !test(p)) }]))
    }));
    this.persist();
  }

  /** Shows a district's plan on the planner page (creating an empty one if needed). */
  setActive(district: string): void {
    if (!this.isKnownDistrict(district)) return;
    this.state.update((s) => ({ active: district, plans: s.plans[district] ? s.plans : { ...s.plans, [district]: emptyPlan() } }));
    this.persist();
  }

  /** HOME_AREA or a district code — kept for shared links and older callers; selects that district's plan. */
  setStartArea(area: string): void {
    this.setActive(area === HOME_AREA ? JAFFNA_DISTRICT : area);
  }

  /** Sets the active plan's trip date; ignores invalid dates and dates in the past. */
  setDate(date: string): void {
    if (!isIsoDate(date) || date < todayIso()) return;
    this.updatePlan(this.activeDistrict(), (plan) => ({ ...plan, date }));
  }

  /** Sets the active plan's start time; false when invalid or (for a trip today) already past. */
  setStartTime(time: string, now = new Date()): boolean {
    if (!/^\d{2}:\d{2}$/.test(time)) return false;
    if (this.date() === todayIso(now) && toMinutes(time) < nowMinutes(now)) return false;
    this.updatePlan(this.activeDistrict(), (plan) => ({ ...plan, startTime: time }));
    return true;
  }

  setReturnHome(returnHome: boolean): void {
    this.setEnd(returnHome ? 'start' : 'none');
  }

  /** Sets where the active plan's day starts; null = the district's main town. */
  setStart(point: TripPoint | null): void {
    if (point && !isTripPoint(point)) return;
    this.updatePlan(this.activeDistrict(), (plan) => ({ ...plan, start: point }));
  }

  /** Sets where the active plan's day ends. */
  setEnd(end: TripEnd): void {
    if (end !== 'start' && end !== 'none' && end !== 'town' && !isTripPoint(end)) return;
    this.updatePlan(this.activeDistrict(), (plan) => ({ ...plan, end }));
  }

  /** Empties the active district's plan. */
  clear(): void {
    this.updatePlan(this.activeDistrict(), (plan) => ({ ...plan, places: [] }));
  }

  private move(place: Place, step: 1 | -1): void {
    this.updatePlan(planDistrictOf(place), (plan) => {
      const list = [...plan.places];
      const index = list.findIndex((p) => planKey(p) === planKey(place));
      const target = index + step;
      if (index === -1 || target < 0 || target >= list.length) return plan;
      [list[index], list[target]] = [list[target], list[index]];
      return { ...plan, places: list };
    });
  }

  private updatePlan(district: string, change: (plan: DistrictPlan) => DistrictPlan): void {
    this.state.update((s) => ({ ...s, plans: { ...s.plans, [district]: change(s.plans[district] ?? emptyPlan()) } }));
    this.persist();
  }

  /** Accepts district codes from the loaded list (or any well-formed code before the list arrives). */
  private isKnownDistrict(code: string): boolean {
    if (!/^LK-\d\d$/.test(code)) return false;
    return this.districts.districts().length === 0 || !!this.districts.byCode(code);
  }

  private groupByDistrict(places: Place[]): Record<string, Place[]> {
    const groups: Record<string, Place[]> = {};
    for (const place of places) (groups[planDistrictOf(place)] ??= []).push(place);
    return groups;
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      // Storage may be unavailable (private mode); the plans still work for this session.
    }
  }

  private load(): StoredPlans {
    let stored: StoredPlans = { active: JAFFNA_DISTRICT, plans: {} };
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as StoredPlans;
      else stored = this.migrateOldPlan() ?? stored;
    } catch {
      // Use an empty set of plans.
    }
    // A remembered date that has passed (or is malformed) moves to today.
    const plans = Object.fromEntries(
      Object.entries(stored.plans ?? {}).map(([code, plan]) => {
        const merged = normalisePlan(plan);
        return [code, !isIsoDate(merged.date) || merged.date < todayIso() ? { ...merged, date: todayIso() } : merged];
      })
    );
    return { active: /^LK-\d\d$/.test(stored.active) ? stored.active : JAFFNA_DISTRICT, plans };
  }

  /** The single plan from before plans were per district, split by district. */
  private migrateOldPlan(): StoredPlans | null {
    const raw = localStorage.getItem(OLD_PLACES_KEY);
    if (!raw) return null;
    const places = JSON.parse(raw) as Place[];
    const old = JSON.parse(localStorage.getItem(OLD_SETTINGS_KEY) ?? '{}') as { date?: string; startTime?: string; returnHome?: boolean };
    const plans: Record<string, DistrictPlan> = {};
    for (const [district, list] of Object.entries(this.groupByDistrict(places))) {
      plans[district] = normalisePlan({ date: old.date, startTime: old.startTime, returnHome: old.returnHome, places: list });
    }
    localStorage.removeItem(OLD_PLACES_KEY);
    localStorage.removeItem(OLD_SETTINGS_KEY);
    return { active: places[0] ? planDistrictOf(places[0]) : JAFFNA_DISTRICT, plans };
  }
}
