import { SelectComponent, SelectOption } from '../../../shared/select/select.component';
import { categoryIcon } from '../../../core/models/category-meta';
import { computed, Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PlaceService } from '../../../core/services/place.service';
import { PlaceStore } from '../../../core/services/place-store.service';
import { PlaceUpsert } from '../../../core/models/place.model';
import { ALL_CATEGORIES } from '../../../core/models/category-meta';
import { HOME_LOCATION, SERVICE_RADIUS_KM } from '../../../core/models/home-reference';
import { JAFFNA_DISTRICT } from '../../../core/models/district.model';
import { DistrictService } from '../../../core/services/district.service';
import { hasValidCoordinates, haversineKm, roundKm } from '../../../core/utils/geo';
import { isInSriLanka, nearestDistrict } from '../../../core/utils/map-places';

// A place further than this from its district's capital probably has the wrong district or coordinates.
const DISTRICT_WARNING_KM = 60;

const EMPTY_FORM: PlaceUpsert = {
  name: '',
  category: 'Religious',
  description: '',
  openingHours: '',
  travelTips: '',
  visitDuration: '',
  latitude: HOME_LOCATION.latitude,
  longitude: HOME_LOCATION.longitude,
  imageUrl: '',
  nameTa: '',
  descriptionTa: '',
  openingHoursTa: '',
  travelTipsTa: '',
  nameSi: '',
  descriptionSi: '',
  openingHoursSi: '',
  travelTipsSi: '',
  district: JAFFNA_DISTRICT,
  isPopular: false
};

@Component({
  selector: 'app-admin-place-form',
  standalone: true,
  imports: [FormsModule, RouterLink, SelectComponent],
  templateUrl: './admin-place-form.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './admin-place-form.component.css'
})
export class AdminPlaceFormComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private placeService = inject(PlaceService);
  private store = inject(PlaceStore);
  readonly districts = inject(DistrictService);

  categories = ALL_CATEGORIES;
  readonly categoryOptions: SelectOption[] = ALL_CATEGORIES.map((c) => ({ value: c, label: c, icon: categoryIcon(c) }));
  readonly districtOptions = computed<SelectOption[]>(() =>
    this.districts.districts().map((d) => ({ value: d.code, label: d.name, keywords: `${d.nameTa} ${d.nameSi ?? ''}` }))
  );
  readonly radiusKm = SERVICE_RADIUS_KM;
  readonly districtWarningKm = DISTRICT_WARNING_KM;

  editingId = signal<number | null>(null);
  isEditMode = () => this.editingId() !== null;

  form: PlaceUpsert = { ...EMPTY_FORM };
  previewFailed = false;

  loading = signal(false);
  errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    this.districts.load();
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) return;

    const id = Number(idParam);
    this.editingId.set(id);
    this.loading.set(true);

    this.placeService.getById(id).subscribe({
      next: (place) => {
        this.form = {
          name: place.name,
          category: place.category,
          description: place.description,
          openingHours: place.openingHours,
          travelTips: place.travelTips,
          visitDuration: place.visitDuration,
          latitude: place.latitude,
          longitude: place.longitude,
          imageUrl: place.imageUrl,
          nameTa: place.nameTa ?? '',
          descriptionTa: place.descriptionTa ?? '',
          openingHoursTa: place.openingHoursTa ?? '',
          travelTipsTa: place.travelTipsTa ?? '',
          nameSi: place.nameSi ?? '',
          descriptionSi: place.descriptionSi ?? '',
          openingHoursSi: place.openingHoursSi ?? '',
          travelTipsSi: place.travelTipsSi ?? '',
          district: place.district || JAFFNA_DISTRICT,
          isPopular: place.isPopular ?? false
        };
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load place for editing.');
        this.loading.set(false);
      }
    });
  }

  /** Checks the entered coordinates against Sri Lanka, the chosen district and the 25 km home area. */
  coordinateCheck() {
    const point = { latitude: Number(this.form.latitude), longitude: Number(this.form.longitude) };
    if (!hasValidCoordinates(point)) return { status: 'invalid' as const };
    if (!isInSriLanka(point)) return { status: 'outside' as const };
    const district = this.districts.byCode(this.form.district);
    const kmFromDistrict = district ? roundKm(haversineKm(district, point)) : null;
    const nearest = nearestDistrict(this.districts.districts(), point);
    return {
      status: 'ok' as const,
      districtName: district?.name ?? '',
      kmFromDistrict,
      farFromDistrict: kmFromDistrict !== null && kmFromDistrict > DISTRICT_WARNING_KM,
      nearestName: nearest?.name ?? '',
      kmFromHome: roundKm(haversineKm(HOME_LOCATION, point))
    };
  }

  previewUrl(): string {
    return `https://www.google.com/maps/search/?api=1&query=${this.form.latitude},${this.form.longitude}`;
  }

  submit(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    const id = this.editingId();
    const request = id ? this.placeService.update(id, this.form) : this.placeService.create(this.form);

    request.subscribe({
      next: () => {
        this.loading.set(false);
        this.store.refresh(); // so visitors' pages show the change
        this.router.navigate(['/admin']);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        // Show the API's validation message (e.g. outside the service area) when there is one.
        const details = Object.values((err.error?.errors ?? {}) as Record<string, string[]>).flat();
        this.errorMessage.set(details[0] ?? 'Failed to save place. Please check the form and try again.');
      }
    });
  }
}
