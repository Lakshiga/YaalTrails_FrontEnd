import { Component, OnInit, computed, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { PlaceService } from '../../core/services/place.service';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { LeafletMapComponent } from '../../shared/leaflet-map/leaflet-map.component';
import { WeatherWidgetComponent } from '../../shared/weather-widget/weather-widget.component';
import { categoryIcon } from '../../core/models/category-meta';
import { APP_NAME } from '../../core/brand';
import { Place } from '../../core/models/place.model';

@Component({
  selector: 'app-visit-planner',
  standalone: true,
  imports: [RouterLink, LeafletMapComponent, WeatherWidgetComponent],
  templateUrl: './visit-planner.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './visit-planner.component.css'
})
export class VisitPlannerComponent implements OnInit {
  visitPlan = inject(VisitPlanService);
  readonly i18n = inject(I18nService);
  private placeService = inject(PlaceService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly categoryIcon = categoryIcon;
  readonly appName = APP_NAME;
  optimising = signal(false);

  today = computed(() =>
    this.i18n.date(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  );

  constructor() {
    // Fetch the real road route whenever the stops, their order or the return leg change.
    effect(
      () => {
        this.visitPlan.plan();
        this.visitPlan.returnHome();
        this.visitPlan.loadRoadRoute();
      },
      // A cached route resolves synchronously and stores the result in a signal.
      { allowSignalWrites: true }
    );
  }

  ngOnInit(): void {
    const sharedIds = (this.route.snapshot.queryParamMap.get('ids') ?? '')
      .split(',')
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0);

    this.placeService.getAll().subscribe({
      next: (places) => {
        if (sharedIds.length > 0) {
          this.loadSharedPlan(sharedIds, places);
        } else {
          // Stored plans hold copies of places; bring them up to date (new photos, edits, deletions).
          this.visitPlan.refreshFrom(places);
        }
      }
    });
  }

  private loadSharedPlan(ids: number[], places: Place[]): void {
    const byId = new Map(places.map((p) => [p.id, p]));
    const shared = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    const current = this.visitPlan.plan().map((p) => p.id).join(',');
    const incoming = shared.map((p) => p.id).join(',');

    if (shared.length > 0 && current !== incoming) {
      const replace = this.visitPlan.plan().length === 0 || confirm(this.i18n.t('plan.confirmShared'));
      if (replace) {
        this.visitPlan.replaceAll(shared);
        this.toast.show(this.i18n.t('plan.sharedLoaded'), 'bi-link-45deg');
      }
    }
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
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

  onStartTime(event: Event): void {
    this.visitPlan.setStartTime((event.target as HTMLInputElement).value);
  }

  onReturnHome(event: Event): void {
    this.visitPlan.setReturnHome((event.target as HTMLInputElement).checked);
  }

  async share(): Promise<void> {
    const ids = this.visitPlan.plan().map((p) => p.id).join(',');
    const url = `${location.origin}/planner?ids=${ids}`;
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
    this.visitPlan.remove(place.id);
    this.toast.show(this.i18n.t('toast.removed', { name: this.i18n.placeName(place) }), 'bi-dash-circle');
  }

  clearPlan(): void {
    if (confirm(this.i18n.t('plan.confirmClear'))) this.visitPlan.clear();
  }
}
