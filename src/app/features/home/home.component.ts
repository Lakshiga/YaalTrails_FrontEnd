import { SelectComponent, SelectOption } from '../../shared/select/select.component';
import { Component, ElementRef, OnInit, ViewChild, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { VisitPlanService } from '../../core/services/visit-plan.service';
import { Place } from '../../core/models/place.model';
import { categoryIcon } from '../../core/models/category-meta';
import { ToastService } from '../../core/services/toast.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { StarRatingComponent } from '../../shared/star-rating/star-rating.component';
import { FadeImageDirective } from '../../shared/fade-image/fade-image.directive';
import { WeatherWidgetComponent } from '../../shared/weather-widget/weather-widget.component';
import { AreaSelectComponent } from '../../shared/area-select/area-select.component';
import { PopularItem, PopularPlacesComponent } from '../../shared/popular-places/popular-places.component';
import { DistrictService } from '../../core/services/district.service';
import { TourPlacesService } from '../../core/services/tour-places.service';
import { TourCard } from '../../core/models/tour-card';
import { ExternalPlace } from '../../core/models/district.model';
import { isPopularPlace } from '../../core/utils/map-places';

export type SortMode = 'best' | 'nearest';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, StarRatingComponent, FadeImageDirective, WeatherWidgetComponent, AreaSelectComponent, PopularPlacesComponent, SelectComponent],
  templateUrl: './home.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  private visitPlan = inject(VisitPlanService);
  private toast = inject(ToastService);
  readonly i18n = inject(I18nService);
  readonly districts = inject(DistrictService);
  private tour = inject(TourPlacesService);

  @ViewChild('placesSection') placesSection?: ElementRef<HTMLElement>;

  readonly categoryIcon = categoryIcon;
  readonly skeletons = [1, 2, 3, 4, 5, 6];
  readonly isPopular = isPopularPlace;

  selectedCategory = signal<string>('All');
  search = signal('');
  sortMode = signal<SortMode>('best');

  readonly loading = this.tour.loading;
  readonly errorMessage = computed(() => (this.tour.failed() ? 'Could not load places.' : null));

  /** Stops in the selected area's district plan. */
  planCount = computed(() => this.visitPlan.countFor(this.districts.osmDistrictCode()));

  /** Extra places (Google / OpenStreetMap) that are not ours. */
  readonly extraPlaces = this.tour.extraPlaces;
  /** Every card in the area, unfiltered. */
  readonly allCards = this.tour.cards;

  /** Every place in the area: ours plus the extra ones (Google / OpenStreetMap). */
  totalCount = computed(() => this.allCards().length);

  /** "Central Province, Sri Lanka" — the selected area's province. */
  heroRegion = computed(() => {
    const province = this.districts.province();
    return province ? this.i18n.t('home.regionOf', { province: this.i18n.t(`province.${province}`) }) : this.i18n.t('home.region');
  });

  heroTitle = computed(() =>
    this.districts.isHomeArea() ? this.i18n.t('home.title') : this.i18n.t('home.titleArea', { area: this.districts.areaName() })
  );

  heroLead = computed(() =>
    this.districts.isHomeArea() ? this.i18n.t('home.lead') : this.i18n.t('home.leadArea', { area: this.districts.areaName() })
  );

  /** Background photo: the area's top popular place (the default Jaffna temple photo for the home area). */
  heroImage = computed(() => {
    if (this.districts.isHomeArea()) return null;
    const photo = this.popularItems().find((p) => p.photoUrl)?.photoUrl;
    return photo ? `url("${photo.replace(/"/g, '%22')}")` : null;
  });

  /** The hero counts wait for both sources, so they do not jump from "2" to "17" as Google places arrive. */
  countsReady = computed(() => !this.loading() && this.districts.external().status !== 'loading');

  categories = computed(() => {
    const counts = new Map<string, number>();
    for (const c of this.allCards()) counts.set(c.place.category, (counts.get(c.place.category) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
  });

  /** The grid: cards filtered by category and search, best (or nearest) first. */
  cards = computed<TourCard[]>(() => {
    const category = this.selectedCategory();
    const term = this.search().trim().toLowerCase();
    const texts = (c: TourCard) =>
      c.kind === 'ours'
        ? [c.place.name, c.place.nameTa, c.place.nameSi, c.place.description, c.place.descriptionTa, c.place.descriptionSi]
        : [c.place.name, c.place.nameTa, c.place.nameSi];
    const byKm = (a: TourCard, b: TourCard) => a.km - b.km;
    return this.allCards()
      .filter((c) => (category === 'All' || c.place.category === category) && (!term || texts(c).some((t) => t?.toLowerCase().includes(term))))
      .sort(this.sortMode() === 'best' ? (a, b) => b.score - a.score || byKm(a, b) : byKm);
  });

  /**
   * The popular strip (ignores the filters): our curated or well-reviewed places, plus Google places rated
   * 4.3★ or more by at least 100 people — best first, at most 8.
   */
  popularItems = computed<PopularItem[]>(() =>
    this.allCards()
      .filter((c) => this.isPopularCard(c))
      .sort((a, b) => b.score - a.score || a.km - b.km)
      .slice(0, 8)
      .map((c) => this.toPopularItem(c))
  );

  /** How many cards are our own places (they link to a details page and can be added to the plan). */
  ourCardCount = computed(() => this.cards().filter((c) => c.kind === 'ours').length);

  /**
   * Cards with no photo of their own or from Google — Wikimedia is asked for these, in display order,
   * so the cards at the top get their photos first.
   */
  private needPhotos = computed(() => {
    const popularKeys = new Set(this.popularItems().map((p) => p.key));
    const popular = this.allCards().filter((c) => popularKeys.has(c.key));
    // Popular cards sit at the top of the page, so they are looked up first.
    return [...popular, ...this.cards()].filter((c, i, all) => all.findIndex((o) => o.key === c.key) === i);
  });

  private isPopularCard(card: TourCard): boolean {
    const wellRated = (rating: number | null | undefined, count: number | null | undefined) => (rating ?? 0) >= 4.3 && (count ?? 0) >= 100;
    return card.kind === 'ours'
      ? isPopularPlace(card.place) || wellRated(card.googleRating, card.googleRatingCount)
      : wellRated(card.place.rating, card.place.ratingCount);
  }

  private toPopularItem(card: TourCard): PopularItem {
    const ours = card.kind === 'ours';
    return {
      key: card.key,
      name: ours ? this.i18n.placeName(card.place) : this.externalName(card.place),
      category: card.place.category,
      photoUrl: this.showPhoto(card) ? card.photoUrl : null,
      photoPending: this.photoPending(card),
      link: ours ? ['/places', String(card.place.id)] : card.link,
      url: ours ? null : card.place.url,
      rating: ours ? (card.place.reviewCount > 0 ? card.place.averageRating : card.googleRating) : (card.place.rating ?? null),
      ratingCount: ours ? (card.place.reviewCount > 0 ? card.place.reviewCount : (card.googleRatingCount ?? 0)) : (card.place.ratingCount ?? 0),
      km: card.km
    };
  }

  /** Photo URLs that failed to download; their cards fall back to the category icon. */
  private failedPhotos = signal<ReadonlySet<string>>(new Set());

  /** Whether the card has a photo that can be shown. */
  showPhoto(card: TourCard): boolean {
    return !!card.photoUrl && !this.failedPhotos().has(card.photoUrl);
  }

  /** A Wikimedia lookup is still running for the card: show a placeholder instead of the icon. */
  photoPending(card: TourCard): boolean {
    return this.tour.photoPending(card);
  }

  photoFailed(url: string | null): void {
    if (url) this.failedPhotos.update((failed) => new Set(failed).add(url));
  }

  constructor() {
    // Ask Wikimedia for photos of places that have none (results fill in as they arrive).
    effect(() => {
      const cards = this.needPhotos();
      untracked(() => this.tour.requestPhotos(cards));
    });
  }

  ngOnInit(): void {
    // Shared state: places already loaded on another page are reused, not fetched again.
    this.tour.start();
  }

  loadPlaces(): void {
    this.tour.retry();
  }

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  clearFilters(): void {
    this.search.set('');
    this.selectedCategory.set('All');
  }

  retryExternal(): void {
    void this.districts.loadExternal(true);
  }

  readonly sortOptions = computed<SelectOption[]>(() => [
    { value: 'best', label: this.i18n.t('home.sortBest'), icon: 'bi-stars' },
    { value: 'nearest', label: this.i18n.t('home.sortNearest'), icon: 'bi-signpost-split' }
  ]);

  onSort(value: string | null): void {
    this.sortMode.set(value === 'nearest' ? 'nearest' : 'best');
  }

  externalName(place: ExternalPlace): string {
    return this.i18n.placeName(place);
  }

  scrollToPlaces(): void {
    this.placesSection?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  isInPlan(place: Place): boolean {
    return this.visitPlan.isInPlan(place);
  }

  toggleInPlan(place: Place): void {
    const adding = !this.visitPlan.isInPlan(place);
    this.visitPlan.toggle(place);
    const name = this.i18n.placeName(place);
    const area = this.districts.areaName();
    this.toast.show(this.i18n.t(adding ? 'toast.addedTo' : 'toast.removedFrom', { name, area }), adding ? 'bi-check2-circle' : 'bi-dash-circle');
  }

  /** The hero "In your day plan" tile opens this area's plan. */
  openAreaPlan(): void {
    this.visitPlan.setActive(this.districts.osmDistrictCode());
  }
}
