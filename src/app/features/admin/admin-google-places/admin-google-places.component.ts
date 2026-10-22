import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DistrictService } from '../../../core/services/district.service';
import { GooglePlacesService } from '../../../core/services/google-places.service';
import { RestrictionService } from '../../../core/services/restriction.service';
import { ToastService } from '../../../core/services/toast.service';
import { ExternalPlace, JAFFNA_DISTRICT } from '../../../core/models/district.model';
import { Place } from '../../../core/models/place.model';
import { categoryIcon } from '../../../core/models/category-meta';
import { AdminPlacesService } from '../admin-places.service';
import { SelectComponent, SelectOption } from '../../../shared/select/select.component';

/** Google search radius around a district capital (the same as visitors' pages use). */
const DISTRICT_RADIUS_KM = 30;

/** How one Google place currently looks to visitors. */
interface GoogleRow {
  place: ExternalPlace;
  /** Hidden — by its own entry, or because our copy of it is hidden. */
  hidden: boolean;
  /** Our place it duplicates (visitors see ours instead of Google's). */
  ours: Place | null;
}

type RowFilter = 'all' | 'visible' | 'hidden';

/**
 * Administrator: the places Google shows visitors for a district, with Hide / Show.
 * Hiding works both ways: hiding a Google place hides our matching place, and our hidden places hide Google's copy.
 */
@Component({
  selector: 'app-admin-google-places',
  standalone: true,
  imports: [RouterLink, SelectComponent],
  template: `
    <section class="surface adm-panel">
      <div class="adm-toolbar">
        <app-select class="adm-select" [pill]="true" [options]="districtOptions()" [value]="district()" (valueChange)="onDistrict($event)" ariaLabel="District" searchPlaceholder="Search districts…" />
        <button type="button" class="btn btn-primary" (click)="loadGoogle()" [disabled]="status() === 'loading'">
          @if (status() === 'loading') {
            <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          } @else {
            <i class="bi bi-arrow-repeat"></i>
          }
          {{ status() === 'ready' ? 'Reload' : 'Show places' }}
        </button>
        @if (status() === 'ready' && rows().length > 0) {
          <div class="adm-segment" role="group" aria-label="Status">
            @for (f of filters; track f.v) {
              <button type="button" [class.active]="filter() === f.v" [attr.aria-pressed]="filter() === f.v" (click)="filter.set(f.v)">
                {{ f.l }} <span class="adm-tab-count">{{ count(f.v) }}</span>
              </button>
            }
          </div>
        }
      </div>

      @switch (status()) {
        @case ('loading') {
          <div class="adm-list">
            @for (s of [1, 2, 3, 4]; track s) {
              <div class="adm-row"><div class="skeleton adm-thumb"></div><div class="skeleton" style="height: 38px"></div></div>
            }
          </div>
        }
        @case ('unavailable') {
          <div class="adm-empty"><i class="bi bi-cloud-slash"></i><p>Google Maps is not set up, so there are no Google places to review.</p></div>
        }
        @case ('error') {
          <div class="adm-empty">
            <i class="bi bi-exclamation-triangle"></i><p>Google did not answer.</p>
            <button type="button" class="btn btn-soft btn-sm" (click)="loadGoogle()">Try again</button>
          </div>
        }
        @case ('ready') {
          @if (visibleRows().length === 0) {
            <div class="adm-empty"><i class="bi bi-search"></i><p>{{ rows().length ? 'Nothing in this list.' : 'Google returned no places for this district.' }}</p></div>
          } @else {
            <div class="adm-list">
              @for (row of visibleRows(); track row.place.id) {
                <article class="adm-row" [class.is-hidden]="row.hidden" [attr.data-category]="row.place.category">
                  <span class="adm-thumb">
                    @if (row.place.photoUrl) {
                      <img [src]="row.place.photoUrl" alt="" loading="lazy" referrerpolicy="no-referrer" />
                    } @else {
                      <i class="bi" [class]="categoryIcon(row.place.category)"></i>
                    }
                  </span>
                  <div class="adm-main">
                    <div class="adm-title">
                      <a [href]="row.place.url" target="_blank" rel="noopener">{{ row.place.name }}</a>
                      @if (row.hidden) {
                        <span class="adm-badge hidden"><i class="bi bi-eye-slash"></i> Hidden</span>
                      }
                      @if (row.ours; as ours) {
                        <span class="adm-badge source" [title]="'Visitors see your place instead of Google’s copy'">
                          <i class="bi bi-link-45deg"></i> Your place: <a [routerLink]="['/places', ours.id]">{{ ours.name }}</a>
                        </span>
                      }
                    </div>
                    <div class="adm-meta">
                      <span class="cat-badge"><i class="bi" [class]="categoryIcon(row.place.category)"></i> {{ row.place.category }}</span>
                      @if (row.place.rating != null) {
                        <span><i class="bi bi-star-fill text-warning"></i> {{ row.place.rating.toFixed(1) }} ({{ row.place.ratingCount ?? 0 }})</span>
                      }
                      @if (row.place.kind) {
                        <span class="adm-hours"><i class="bi bi-tag"></i> {{ row.place.kind.replaceAll('_', ' ') }}</span>
                      }
                    </div>
                  </div>
                  <div class="adm-actions">
                    @if (row.hidden) {
                      <button type="button" class="btn btn-sm btn-primary" (click)="show(row)" [disabled]="busy() === row.place.id"><i class="bi bi-eye"></i> Show</button>
                    } @else {
                      <button type="button" class="btn btn-sm btn-outline-danger" (click)="hide(row)" [disabled]="busy() === row.place.id"><i class="bi bi-eye-slash"></i> Hide</button>
                    }
                  </div>
                </article>
              }
            </div>
          }
        }
        @default {
          <div class="adm-empty"><i class="bi bi-google"></i><p>Choose a district and press <strong>Show places</strong>.</p></div>
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [':host { display: block; }']
})
export class AdminGooglePlacesComponent implements OnInit {
  readonly districts = inject(DistrictService);
  readonly restrictions = inject(RestrictionService);
  private admin = inject(AdminPlacesService);
  private toast = inject(ToastService);
  private googlePlacesApi = inject(GooglePlacesService);
  readonly categoryIcon = categoryIcon;
  readonly filters: { v: RowFilter; l: string }[] = [
    { v: 'all', l: 'All' },
    { v: 'visible', l: 'Visible' },
    { v: 'hidden', l: 'Hidden' }
  ];

  district = signal(JAFFNA_DISTRICT);
  status = signal<'idle' | 'loading' | 'ready' | 'error' | 'unavailable'>('idle');
  googlePlaces = signal<ExternalPlace[]>([]);
  filter = signal<RowFilter>('all');
  /** The place being saved, to disable its button. */
  busy = signal<string | null>(null);

  rows = computed<GoogleRow[]>(() =>
    this.googlePlaces().map((place) => {
      const ours = this.admin.matchesFor(place)[0] ?? null;
      return { place, ours, hidden: this.restrictions.isRestricted(place) };
    })
  );

  visibleRows = computed(() => {
    const filter = this.filter();
    return this.rows().filter((r) => filter === 'all' || (filter === 'hidden') === r.hidden);
  });

  private center = computed(() => {
    const d = this.districts.byCode(this.district());
    return d ? { latitude: d.latitude, longitude: d.longitude } : { latitude: 9.6615, longitude: 80.0255 };
  });

  ngOnInit(): void {
    this.districts.load();
    void this.restrictions.load();
  }

  count(filter: RowFilter): number {
    return this.rows().filter((r) => filter === 'all' || (filter === 'hidden') === r.hidden).length;
  }

  readonly districtOptions = computed<SelectOption[]>(() =>
    this.districts.districts().map((d) => ({ value: d.code, label: d.name, keywords: `${d.nameTa} ${d.nameSi ?? ''}` }))
  );

  onDistrict(code: string | null): void {
    if (!code || code === this.district()) return;
    this.district.set(code);
    this.status.set('idle');
    this.googlePlaces.set([]);
    this.filter.set('all');
  }

  async loadGoogle(): Promise<void> {
    this.status.set('loading');
    try {
      // Same search as visitors' pages (and the same cache), so the admin sees exactly what they see.
      this.googlePlaces.set(await this.googlePlacesApi.nearby(this.center(), DISTRICT_RADIUS_KM));
      this.status.set('ready');
    } catch (error) {
      this.status.set(error instanceof HttpErrorResponse && error.status === 503 ? 'unavailable' : 'error');
    }
  }

  /** Hides the Google place and our copy of it. */
  async hide(row: GoogleRow): Promise<void> {
    await this.save(row.place.id, async () => {
      const ours = await this.admin.hideExternal(row.place, this.district());
      this.toast.show(
        ours.length ? `“${row.place.name}” and your place “${ours.join('”, “')}” are hidden from visitors.` : `“${row.place.name}” is hidden from visitors.`,
        'bi-eye-slash'
      );
    });
  }

  /** Shows the Google place again — undoing whichever hide applies (its own entry and/or our hidden copy). */
  async show(row: GoogleRow): Promise<void> {
    await this.save(row.place.id, async () => {
      const names = [row.place.name];
      const entry = this.restrictions.entryFor(row.place);
      if (entry) names.push(...(await this.admin.showExternal(entry)));
      const stillHiddenBy = this.restrictions.hiddenOurMatch(row.place);
      const ours = stillHiddenBy && this.admin.places().find((p) => p.id === stillHiddenBy.id);
      if (ours) {
        await this.admin.setHidden(ours, false);
        names.push(ours.name);
      }
      const unique = [...new Set(names)];
      this.toast.show(`${unique.map((n) => `“${n}”`).join(' and ')} ${unique.length > 1 ? 'are' : 'is'} visible to visitors again.`, 'bi-eye');
    });
  }

  private async save(id: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(id);
    try {
      await action();
    } catch {
      this.toast.show('Could not save the change. Please try again.', 'bi-exclamation-triangle');
    } finally {
      this.busy.set(null);
    }
  }
}
