import { Component, DestroyRef, ElementRef, OnInit, ViewChild, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { PlaceStore } from '../../core/services/place-store.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { MapComponent } from '../../shared/map/map.component';
import { PickerValue, TripPointPickerComponent } from './trip-point-picker.component';
import { ResolvedPoint, TripPoint } from '../../core/services/visit-plan.service';
import { WeatherWidgetComponent } from '../../shared/weather-widget/weather-widget.component';
import { categoryIcon } from '../../core/models/category-meta';
import { APP_NAME } from '../../core/brand';
import { Place } from '../../core/models/place.model';
import { DistrictService } from '../../core/services/district.service';
import { HOME_AREA, JAFFNA_DISTRICT } from '../../core/models/district.model';
import { ScheduledStop, todayIso } from '../../core/services/visit-plan.service';
import { OpeningHoursService } from '../../core/services/opening-hours.service';
import { RestrictionService } from '../../core/services/restriction.service';
import { isHoursProblem } from '../../core/utils/opening-hours';
import { GooglePlacesService } from '../../core/services/google-places.service';
import { externalToPlace, placeLink, planKey } from '../../core/utils/place-ref';
import { PhotoFallbackService } from '../../core/services/photo-fallback.service';
import { FadeImageDirective } from '../../shared/fade-image/fade-image.directive';
import { nearestDistrict } from '../../core/utils/map-places';
import { LatLng, haversineKm, roundKm } from '../../core/utils/geo';

@Component({
  selector: 'app-visit-planner',
  standalone: true,
  imports: [RouterLink, MapComponent, WeatherWidgetComponent, FadeImageDirective, TripPointPickerComponent],
  templateUrl: './visit-planner.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './visit-planner.component.css'
})
export class VisitPlannerComponent implements OnInit {
  visitPlan = inject(VisitPlanService);
  readonly i18n = inject(I18nService);
  private store = inject(PlaceStore);
  private toast = inject(ToastService);
  private openingHours = inject(OpeningHoursService);
  private restrictions = inject(RestrictionService);
  private destroyRef = inject(DestroyRef);

  /** Which point is being chosen on the map, if any. */
  picking = signal<'start' | 'end' | null>(null);
  @ViewChild('mapCard') mapCard?: ElementRef<HTMLElement>;

  /** The current time, refreshed every 30 s — today's start time limit and "has passed" warning follow it. */
  private now = signal(new Date());

  /** Earliest start time allowed (HH:mm) when the trip is today; null for later dates. */
  minStartTime = computed(() => (this.isToday() ? this.hhmm(this.now()) : null));

  /** Today's plan whose start time has already passed. */
  startPassed = computed(() => this.visitPlan.startTimePassed(this.now()));

  /** The next start time we can offer: now, rounded up to the next 5 minutes. */
  nextStartTime = computed(() => {
    const next = new Date(this.now().getTime() + 5 * 60 * 1000);
    next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5, 0, 0);
    return this.hhmm(next);
  });

  /** The same, written the way the rest of the page shows times ("4:10 PM"). */
  nextStartLabel = computed(() => {
    const [h, m] = this.nextStartTime().split(':').map(Number);
    return this.i18n.clock(h * 60 + m);
  });
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly districts = inject(DistrictService);
  private googlePlaces = inject(GooglePlacesService);
  readonly planKey = planKey;
  private photoFallback = inject(PhotoFallbackService);
  readonly placeLink = placeLink;

  readonly categoryIcon = categoryIcon;
  readonly appName = APP_NAME;
  optimising = signal(false);

  readonly minDate = todayIso();

  /** The trip date written out, e.g. "Saturday, 18 October 2026". */
  tripDate = computed(() =>
    this.i18n.date(`${this.visitPlan.date()}T00:00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  );

  isToday = computed(() => this.visitPlan.date() === todayIso());

  /** Who calculated the road route, for the credit next to it. */
  routeProvider = computed(() => (this.visitPlan.roadRoute()?.provider === 'google' ? 'Google' : 'OSRM'));

  /** "Kandy town" (Jaffna town for Jaffna plans). */
  townLabel = computed(() => {
    const district = this.districts.byCode(this.visitPlan.startArea());
    return district ? this.i18n.t('plan.districtTown', { name: this.i18n.districtName(district) }) : this.i18n.t('map.home');
  });

  /** Name of the start point: the district town, "My location" or a searched place. */
  startLabel = computed(() => this.pointLabel(this.visitPlan.startPoint()));

  /** Name of the end point, or null when the day ends at the last stop. */
  endLabel = computed(() => {
    const end = this.visitPlan.endPoint();
    return end ? this.pointLabel(end) : null;
  });

  /** The day ends where it started (the timeline says "Back in …"). */
  endsAtStart = computed(() => {
    const start = this.visitPlan.startPoint();
    const end = this.visitPlan.endPoint();
    return !!end && end.latitude === start.latitude && end.longitude === start.longitude;
  });

  /** A separate end point for the map, when the day does not end at the start. */
  mapEndPoint = computed(() => {
    const end = this.visitPlan.endPoint();
    return end && !this.endsAtStart() ? { latitude: end.latitude, longitude: end.longitude } : null;
  });

  startValue = computed<PickerValue>(() => this.visitPlan.start() ?? 'town');
  endValue = computed<PickerValue>(() => this.visitPlan.end());

  private pointLabel(point: ResolvedPoint): string {
    return point.kind === 'town' ? this.townLabel() : point.label;
  }

  /** The stop's own photo, or a Wikimedia photo. */
  thumb(place: Place): string | null {
    return place.imageUrl || this.photoFallback.photoFor(planKey(place))?.url || null;
  }

  thumbPending(place: Place): boolean {
    return !this.thumb(place) && this.photoFallback.isPending(planKey(place));
  }

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));

    // Opening hours of Google stops (our places' hours come with the place).
    effect(() => {
      const places = this.visitPlan.plan();
      untracked(() => this.openingHours.request(places));
    });

    // Find Wikimedia photos for stops without one.
    effect(() => {
      const missing = this.visitPlan
        .plan()
        .filter((p) => !p.imageUrl)
        .map((p) => ({ key: planKey(p), name: p.name, latitude: p.latitude, longitude: p.longitude }));
      untracked(() => this.photoFallback.request(missing));
    });

    // Fetch the real road route whenever the stops, their order or the return leg change.
    effect(
      () => {
        this.visitPlan.plan();
        this.visitPlan.startPoint();
        this.visitPlan.endPoint();
        this.visitPlan.loadRoadRoute();
      },
      // A cached route resolves synchronously and stores the result in a signal.
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    this.districts.load();
    // Google / OpenStreetMap places the administrator has hidden leave the plans.
    void this.restrictions.load().then(() => this.visitPlan.removeWhere((p) => this.restrictions.isRestrictedStop(p)));
    // Shared links list stops as "p:12" (ours) or "google:<place id>"; older links used ids=1,4,6.
    const params = this.route.snapshot.queryParamMap;
    const sharedKeys = params.get('stops')
      ? params.get('stops')!.split(',').filter(Boolean)
      : (params.get('ids') ?? '').split(',').filter((id) => /^\d+$/.test(id)).map((id) => `p:${id}`);

    const query = this.route.snapshot.queryParamMap;
    void this.store.whenReady().then((places) => {
        if (sharedKeys.length > 0) {
          // A shared link may carry the trip date, start time and start point.
          const date = query.get('date');
          const start = query.get('start');
          const from = query.get('from');
          if (date) this.visitPlan.setDate(date);
          if (start) this.visitPlan.setStartTime(start);
          if (from) this.visitPlan.setStartArea(from);
          void this.loadSharedPlan(sharedKeys, places);
        } else {
          // Stored plans hold copies of places; bring them up to date (new photos, edits, deletions).
          // An empty list means loading failed: keep the plan as it is rather than dropping every stop.
          if (places.length > 0) this.visitPlan.refreshFrom(places);
        }
    });
  }

  private async loadSharedPlan(keys: string[], places: Place[]): Promise<void> {
    const byId = new Map(places.map((p) => [p.id, p]));
    const resolved = await Promise.all(keys.map((key) => this.resolveSharedStop(key, byId)));
    const shared = resolved.filter((p): p is Place => p !== null);
    const current = this.visitPlan.plan().map(planKey).join(',');
    const incoming = shared.map(planKey).join(',');

    if (shared.length > 0 && current !== incoming) {
      const replace = this.visitPlan.plan().length === 0 || confirm(this.i18n.t('plan.confirmShared'));
      if (replace) {
        this.visitPlan.replaceAll(shared);
        this.toast.show(this.i18n.t('plan.sharedLoaded'), 'bi-link-45deg');
      }
    }
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
  }

  /** Our place from the loaded list, or a Google place fetched live; null when it cannot be found. */
  private async resolveSharedStop(key: string, ours: Map<number, Place>): Promise<Place | null> {
    if (key.startsWith('p:')) return ours.get(Number(key.slice(2))) ?? null;
    if (!key.startsWith('google:')) return null;
    try {
      const details = await this.googlePlaces.details(key.slice('google:'.length));
      return details ? externalToPlace(details.place, nearestDistrict(this.districts.districts(), details.place)?.code) : null;
    } catch {
      return null;
    }
  }

  async optimise(): Promise<void> {
    this.optimising.set(true);
    try {
      await this.visitPlan.optimiseOrder();
      this.toast.show(this.i18n.t('plan.optimised'), 'bi-magic');
    } finally {
      this.optimising.set(false);
    }
  }

  onDate(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.visitPlan.setDate(input.value);
    input.value = this.visitPlan.date(); // undo an invalid or past date
  }

  /** District name for a plan tab ("Jaffna", "Kandy", …). */
  districtLabel(code: string): string {
    const district = this.districts.byCode(code);
    return district ? this.i18n.districtName(district) : code === JAFFNA_DISTRICT ? this.i18n.t('area.homeShort') : code;
  }

  /** Opens the home page on the active plan's district, to add more of its places. */
  exploreDistrict(): void {
    const code = this.visitPlan.activeDistrict();
    this.districts.setArea(code === JAFFNA_DISTRICT ? HOME_AREA : code);
    void this.router.navigate(['/']);
  }

  onStartTime(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.visitPlan.setStartTime(input.value)) {
      input.value = this.visitPlan.startTime(); // undo a time that has already passed
      this.toast.show(this.i18n.t('plan.pastTime'), 'bi-clock-history');
    }
  }

  /** Moves a passed start time to the next few minutes. */
  startSoon(): void {
    this.visitPlan.setStartTime(this.nextStartTime());
  }

  /** The opening-hours badge for a stop. */
  hoursBadge(stop: ScheduledStop): { tone: 'ok' | 'info' | 'warn' | 'muted'; icon: string; text: string } {
    const { check, hours } = stop;
    const clock = (m: number | undefined) => (m === undefined ? '' : this.i18n.clock(m % (24 * 60)));
    switch (check.status) {
      case 'ok':
        return hours.kind === 'always'
          ? { tone: 'ok', icon: 'bi-check-circle', text: this.i18n.t('hours.open24') }
          : { tone: 'ok', icon: 'bi-check-circle', text: this.i18n.t('hours.open', { from: clock(check.opensAt), to: clock(check.closesAt) }) };
      case 'waits':
        return { tone: 'info', icon: 'bi-hourglass-split', text: this.i18n.t('hours.waits', { time: clock(check.opensAt), wait: this.i18n.minutes(check.wait) }) };
      case 'closesEarly':
        return { tone: 'warn', icon: 'bi-exclamation-triangle', text: this.i18n.t('hours.closesEarly', { time: clock(check.closesAt) }) };
      case 'closedNow':
        return { tone: 'warn', icon: 'bi-x-octagon', text: this.i18n.t('hours.closedNow', { time: clock(check.closesAt) }) };
      case 'closedDay':
        return { tone: 'warn', icon: 'bi-x-octagon', text: this.i18n.t('hours.closedDay', { day: this.tripWeekday() }) };
      default:
        return { tone: 'muted', icon: 'bi-question-circle', text: this.i18n.t('hours.unknown') };
    }
  }

  isProblem(stop: ScheduledStop): boolean {
    return isHoursProblem(stop.check.status);
  }

  /** "Tuesday" — the trip's day of the week. */
  private tripWeekday(): string {
    return this.i18n.date(`${this.visitPlan.date()}T00:00:00`, { weekday: 'long' });
  }

  private hhmm(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  onStartChosen(value: PickerValue): void {
    if (value === 'town') this.visitPlan.setStart(null);
    else if (typeof value === 'object') this.visitPlan.setStart(value as TripPoint);
  }

  onEndChosen(value: PickerValue): void {
    this.visitPlan.setEnd(value);
  }

  /** "Choose on the map": the next tap on the route map sets the start or end. */
  startPicking(kind: 'start' | 'end'): void {
    this.picking.set(kind);
    this.mapCard?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  onMapClick(point: LatLng): void {
    const kind = this.picking();
    if (!kind) return;
    const chosen: TripPoint = { kind: 'place', label: this.labelFor(point), latitude: point.latitude, longitude: point.longitude };
    if (kind === 'start') this.visitPlan.setStart(chosen);
    else this.visitPlan.setEnd(chosen);
    this.picking.set(null);
    this.toast.show(this.i18n.t(kind === 'start' ? 'trip.startSet' : 'trip.endSet', { place: chosen.label }), 'bi-geo-alt');
  }

  /** "Near Temple of the Sacred Tooth Relic" when a known place is within 1.5 km of the tapped point. */
  private labelFor(point: LatLng): string {
    const candidates = [...this.visitPlan.plan(), ...this.store.places()];
    let nearest: Place | null = null;
    let nearestKm = Infinity;
    for (const place of candidates) {
      const km = haversineKm(point, place);
      if (km < nearestKm) {
        nearest = place;
        nearestKm = km;
      }
    }
    if (nearest && nearestKm <= 1.5) {
      return nearestKm < 0.1
        ? this.i18n.placeName(nearest)
        : this.i18n.t('trip.near', { name: this.i18n.placeName(nearest), km: roundKm(nearestKm) });
    }
    return this.i18n.t('trip.pinned');
  }

  async share(): Promise<void> {
    // OpenStreetMap stops cannot be looked up again by id, so they are left out of shared links.
    const params = new URLSearchParams({
      stops: this.visitPlan.plan().filter((p) => p.external?.source !== 'osm').map(planKey).join(','),
      date: this.visitPlan.date(),
      start: this.visitPlan.startTime(),
      from: this.visitPlan.startArea()
    });
    const url = `${location.origin}/planner?${params.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.show(this.i18n.t('plan.linkCopied'), 'bi-clipboard-check');
    } catch {
      prompt(this.i18n.t('plan.copyPrompt'), url);
    }
  }

  print(): void {
    window.print();
  }

  remove(place: Place): void {
    this.visitPlan.remove(place);
    this.toast.show(this.i18n.t('toast.removed', { name: this.i18n.placeName(place) }), 'bi-dash-circle');
  }

  clearPlan(): void {
    if (confirm(this.i18n.t('plan.confirmClear'))) this.visitPlan.clear();
  }
}
