import { Component, OnInit, computed, effect, inject, signal, untracked, ChangeDetectionStrategy } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserLocationService } from '../../core/services/user-location.service';
import { PlaceStore } from '../../core/services/place-store.service';
import { TourPlacesService } from '../../core/services/tour-places.service';
import { TourCard } from '../../core/models/tour-card';
import { MapComponent } from '../../shared/map/map.component';
import { FadeImageDirective } from '../../shared/fade-image/fade-image.directive';
import { categoryIcon } from '../../core/models/category-meta';
import { HOME_LOCATION, SERVICE_RADIUS_KM } from '../../core/models/home-reference';
import { nearestDistrict, selectMapPlaces } from '../../core/utils/map-places';
import { haversineKm, roundKm } from '../../core/utils/geo';
import { DistrictService } from '../../core/services/district.service';
import { AreaSelectComponent } from '../../shared/area-select/area-select.component';
import { I18nService } from '../../core/i18n/i18n.service';

/** A sidebar row: a place (ours or Google) with its straight-line distance. */
interface MapRow {
  card: TourCard;
  km: number;
}

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, MapComponent, AreaSelectComponent, FadeImageDirective],
  templateUrl: './map-view.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './map-view.component.css'
})
export class MapViewComponent implements OnInit {
  private store = inject(PlaceStore);
  private tour = inject(TourPlacesService);

  readonly categoryIcon = categoryIcon;
  readonly radiusKm = SERVICE_RADIUS_KM;
  readonly i18n = inject(I18nService);
  readonly location = inject(UserLocationService);
  readonly districts = inject(DistrictService);

  selectedCategory = signal('All');
  /** Include Google (or OpenStreetMap) places in the list and on the map. */
  showExternal = signal(true);

  readonly loading = this.tour.loading;
  readonly errorMessage = computed(() => (this.tour.failed() ? 'Could not load places.' : null));

  /** Our places and the extra ones for the area — the same shared list as the home page. */
  private cards = computed(() => this.tour.cards().filter((c) => c.kind === 'ours' || this.showExternal()));

  categories = computed(() => [...new Set(this.cards().map((c) => c.place.category))].sort());

  /** Only used for the "N places not shown" notes about our own data. */
  selection = computed(() =>
    selectMapPlaces(this.store.places(), this.selectedCategory(), {
      area: this.districts.area(),
      home: HOME_LOCATION,
      radiusKm: SERVICE_RADIUS_KM
    })
  );

  /** Places in the category, nearest first — measured from the visitor when located, else from the area centre. */
  rows = computed<MapRow[]>(() => {
    const category = this.selectedCategory();
    const origin = this.location.origin();
    return this.cards()
      .filter((c) => category === 'All' || c.place.category === category)
      .map((card) => ({ card, km: origin ? roundKm(haversineKm(origin, card.place)) : card.km }))
      .sort((a, b) => a.km - b.km);
  });

  /** Map pins: every row, Google places included, carrying their photos for the popups. */
  places = computed(() => this.rows().map((r) => this.tour.asPlace(r.card)));

  /** How many extra (Google / OpenStreetMap) places the area has. */
  externalCount = computed(() => this.tour.extraPlaces().length);

  /** The district whose capital is closest to the visitor, offered as a shortcut. */
  nearest = computed(() => {
    const origin = this.location.origin();
    return origin ? nearestDistrict(this.districts.districts(), origin) : null;
  });

  constructor() {
    // Photos for the list, top rows first (results are shared with the home page).
    effect(() => {
      const cards = this.rows().map((r) => r.card);
      untracked(() => this.tour.requestPhotos(cards));
    });
  }

  ngOnInit(): void {
    // Shared state: places already loaded on another page are reused, not fetched again.
    this.tour.start();
  }

  load(): void {
    this.tour.retry();
  }

  showNearest(): void {
    const district = this.nearest();
    if (district) this.districts.setArea(district.code);
  }

  name(card: TourCard): string {
    return this.i18n.placeName(card.place);
  }

  photoPending(card: TourCard): boolean {
    return this.tour.photoPending(card);
  }

  /** Router link for the row, or null when it opens an outside page (OpenStreetMap places). */
  link(card: TourCard): string[] | null {
    return card.kind === 'ours' ? ['/places', String(card.place.id)] : card.link;
  }

  rating(card: TourCard): number | null {
    if (card.kind === 'external') return card.place.rating ?? null;
    return card.place.reviewCount > 0 ? card.place.averageRating : card.googleRating;
  }
}
