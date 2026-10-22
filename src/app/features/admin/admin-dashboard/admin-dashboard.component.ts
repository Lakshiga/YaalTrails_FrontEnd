import { Component, OnInit, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AdminReview, Place } from '../../../core/models/place.model';
import { StarRatingComponent } from '../../../shared/star-rating/star-rating.component';
import { categoryIcon } from '../../../core/models/category-meta';
import { DistrictService } from '../../../core/services/district.service';
import { RestrictedPlace, RestrictionService } from '../../../core/services/restriction.service';
import { ToastService } from '../../../core/services/toast.service';
import { AdminGooglePlacesComponent } from '../admin-google-places/admin-google-places.component';
import { AdminPlacesService } from '../admin-places.service';
import { SelectComponent, SelectOption } from '../../../shared/select/select.component';
import { ADMIN_TABS, AdminTab } from '../admin-shell/admin-shell.component';

type StatusFilter = 'all' | 'visible' | 'hidden' | 'popular';

const TAB_HEADINGS: Record<AdminTab, { title: string; lead: string }> = {
  places: { title: 'Your places', lead: 'Everything in your database. Hide a place to take it off the visitor site without losing it.' },
  google: { title: 'Google places', lead: 'What Google suggests to visitors. Hide anything unsuitable — your own copy is hidden with it.' },
  hidden: { title: 'Hidden places', lead: 'Nothing here appears on the home page, the map, place pages or day plans.' },
  reviews: { title: 'Visitor reviews', lead: 'Newest first. Remove anything abusive or off-topic.' }
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, StarRatingComponent, AdminGooglePlacesComponent, SelectComponent],
  templateUrl: './admin-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './admin-dashboard.component.css'
})
export class AdminDashboardComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  readonly admin = inject(AdminPlacesService);
  readonly restrictions = inject(RestrictionService);
  readonly districts = inject(DistrictService);
  readonly categoryIcon = categoryIcon;

  /** The section, from ?tab= (so the sidebar, bottom tabs and back button all work). */
  tab = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => {
        const tab = params.get('tab') as AdminTab | null;
        return tab && ADMIN_TABS.includes(tab) ? tab : 'places';
      })
    ),
    { initialValue: 'places' as AdminTab }
  );
  heading = computed(() => TAB_HEADINGS[this.tab()]);

  search = signal('');
  districtFilter = signal('all');
  statusFilter = signal<StatusFilter>('all');
  /** The row being saved, so its controls can be disabled. */
  busy = signal<string | null>(null);

  /** Everything visitors cannot see: our hidden places plus hidden Google / OpenStreetMap places. */
  hiddenTotal = computed(() => this.admin.hiddenPlaces().length + this.restrictions.list().length);

  /** Districts that have at least one of our places (for the filter). */
  placeDistricts = computed(() => {
    const codes = new Set(this.admin.places().map((p) => p.district));
    return this.districts.districts().filter((d) => codes.has(d.code));
  });

  districtFilterOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: 'All districts', icon: 'bi-globe-asia-australia' },
    ...this.placeDistricts().map((d) => ({ value: d.code, label: d.name, keywords: `${d.nameTa} ${d.nameSi ?? ''}` }))
  ]);

  filteredPlaces = computed(() => {
    const term = this.search().trim().toLowerCase();
    const district = this.districtFilter();
    const status = this.statusFilter();
    return [...this.admin.places()]
      .filter((p) => district === 'all' || p.district === district)
      .filter(
        (p) =>
          status === 'all' ||
          (status === 'visible' && !p.isHidden) ||
          (status === 'hidden' && p.isHidden) ||
          (status === 'popular' && p.isPopular)
      )
      .filter((p) => !term || [p.name, p.category, this.districtName(p.district)].some((t) => t.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    // Reload on every visit: a place may have just been added or edited.
    this.admin.load();
  }

  setTab(tab: AdminTab, status?: StatusFilter): void {
    if (status) this.statusFilter.set(status);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { tab } });
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.search.set('');
    this.districtFilter.set('all');
    this.statusFilter.set('all');
  }

  districtName(code: string): string {
    return this.districts.byCode(code)?.name ?? code;
  }

  /** Visibility switch: hides the place (and Google's copy of it) from visitors, or shows it again. */
  async toggleVisibility(place: Place): Promise<void> {
    const hide = !place.isHidden;
    await this.run(`place-${place.id}`, async () => {
      await this.admin.setHidden(place, hide);
      this.toast.show(hide ? `“${place.name}” is now hidden from visitors (Google’s copy too).` : `“${place.name}” is visible to visitors again.`, hide ? 'bi-eye-slash' : 'bi-eye');
    });
  }

  async deletePlace(place: Place): Promise<void> {
    if (!confirm(`Delete “${place.name}” permanently? Its reviews are deleted too. To keep it, hide it instead.`)) return;
    await this.run(`place-${place.id}`, async () => {
      await this.admin.delete(place);
      this.toast.show(`“${place.name}” was deleted.`, 'bi-trash3');
    });
  }

  /** Shows a hidden Google / OpenStreetMap place again (with our matching places). */
  async showExternal(entry: RestrictedPlace): Promise<void> {
    await this.run(`ext-${entry.id}`, async () => {
      const ours = await this.admin.showExternal(entry);
      this.toast.show(ours.length ? `“${entry.name}” and your place “${ours.join('”, “')}” are visible again.` : `“${entry.name}” is visible again.`, 'bi-eye');
    });
  }

  async deleteReview(review: AdminReview): Promise<void> {
    if (!confirm(`Delete the review by “${review.visitorName}” on ${review.placeName}?`)) return;
    await this.run(`review-${review.id}`, async () => {
      await this.admin.deleteReview(review);
      this.toast.show('Review deleted.', 'bi-trash3');
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  private async run(key: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(key);
    try {
      await action();
    } catch {
      this.toast.show('Could not save the change. Please try again.', 'bi-exclamation-triangle');
    } finally {
      this.busy.set(null);
    }
  }
}
