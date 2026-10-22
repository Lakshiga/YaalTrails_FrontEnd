import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable, catchError, firstValueFrom, map, shareReplay, throwError } from 'rxjs';
import { API_BASE_URL } from '../config';
import { District, ExternalPlace, ExternalSource, HOME_AREA, JAFFNA_DISTRICT, provinceOf } from '../models/district.model';
import { HOME_LOCATION, SERVICE_RADIUS_KM } from '../models/home-reference';
import { LatLng } from '../utils/geo';
import { I18nService } from '../i18n/i18n.service';
import { GooglePlacesService } from './google-places.service';

/** Google Places searches this far around a district's capital (districts are roughly 30–60 km across). */
const DISTRICT_SEARCH_RADIUS_KM = 30;

const AREA_KEY = 'yaal_area';

export interface ExternalState {
  /** Which source and area the places belong to, e.g. "google:LK-21". */
  code: string;
  source: ExternalSource;
  status: 'idle' | 'loading' | 'ready' | 'error';
  places: ExternalPlace[];
}

/** Sri Lanka's districts, the area the visitor is exploring, and extra places (Google Places or OpenStreetMap) for it. */
@Injectable({ providedIn: 'root' })
export class DistrictService {
  private http = inject(HttpClient);
  private i18n = inject(I18nService);
  private googlePlaces = inject(GooglePlacesService);
  private baseUrl = `${API_BASE_URL}/districts`;
  private osmRequests = new Map<string, Observable<ExternalPlace[]>>();
  private requested = false;

  readonly districts = signal<District[]>([]);

  /** Extra places for the selected area (see loadExternal). */
  readonly external = signal<ExternalState>({ code: '', source: 'osm', status: 'idle', places: [] });

  /** HOME_AREA (within 25 km of Jaffna town — the default) or a district code. */
  readonly area = signal<string>(this.loadArea());

  readonly district = computed(() => this.byCode(this.area()));
  readonly isHomeArea = computed(() => this.area() === HOME_AREA);

  /** Display name of the selected area, in the current language. */
  readonly areaName = computed(() => {
    const district = this.district();
    return district ? this.i18n.districtName(district) : this.i18n.t('area.homeShort');
  });

  /** Province (1–9) of the selected area; the home area lies in Jaffna district (Northern Province). */
  readonly province = computed(() => provinceOf(this.isHomeArea() ? JAFFNA_DISTRICT : this.area()));

  /** Where distances are measured from when the visitor's own location is not used. */
  readonly center = computed<LatLng>(() => {
    const district = this.district();
    return district ? { latitude: district.latitude, longitude: district.longitude } : HOME_LOCATION;
  });

  /** District to ask OpenStreetMap about: the home area lies in Jaffna district. */
  readonly osmDistrictCode = computed(() => (this.isHomeArea() ? JAFFNA_DISTRICT : this.area()));

  /** Changes whenever extra places must be (re)loaded: new area, district list arrived, or map provider changed. */
  readonly externalTrigger = computed(() => `${this.area()}|${this.district()?.code ?? ''}|${this.googlePlaces.available()}`);

  constructor() {
    effect(() => {
      const area = this.area();
      try {
        localStorage.setItem(AREA_KEY, area);
      } catch {
        // Storage unavailable; the choice still applies for this session.
      }
    });
  }

  /** Loads the district list once. */
  load(): void {
    if (this.requested) return;
    this.requested = true;
    this.http.get<District[]>(this.baseUrl).subscribe({
      next: (districts) => {
        this.districts.set([...districts].sort((a, b) => a.name.localeCompare(b.name)));
        // Fall back to the home area if a remembered district no longer exists.
        if (!this.isHomeArea() && !this.byCode(this.area())) this.area.set(HOME_AREA);
      },
      error: () => (this.requested = false)
    });
  }

  setArea(area: string): void {
    this.area.set(area === HOME_AREA || this.byCode(area) ? area : HOME_AREA);
  }

  byCode(code: string | null | undefined): District | null {
    return this.districts().find((d) => d.code === code) ?? null;
  }

  /**
   * Loads extra places for the selected area into `external` — Google places via our backend when it has a Google
   * key, otherwise (or when Google fails) OpenStreetMap places, also via our backend. No-op when already loaded or loading.
   */
  async loadExternal(force = false): Promise<void> {
    const area = this.area();
    const useGoogle = this.googlePlaces.available() !== false;
    // Google searches around the district capital, so wait until the district list has arrived.
    if (this.area() !== area || (useGoogle && !this.isHomeArea() && !this.district())) return;

    const source: ExternalSource = useGoogle ? 'google' : 'osm';
    const code = `${source}:${area}`;
    const current = this.external();
    if (!force && current.code === code && current.status !== 'idle') return;
    this.external.set({ code, source, status: 'loading', places: [] });

    try {
      const places = useGoogle
        ? await this.googlePlaces.nearby(this.center(), this.isHomeArea() ? SERVICE_RADIUS_KM : DISTRICT_SEARCH_RADIUS_KM)
        : await firstValueFrom(this.osmPlaces(this.osmDistrictCode()));
      // Ignore answers for an area the visitor has already left.
      if (this.external().code === code) this.external.set({ code, source, status: 'ready', places });
    } catch {
      if (this.external().code !== code) return;
      if (useGoogle) {
        // Google refused (e.g. the key's project has no billing): show OpenStreetMap places instead.
        await this.loadOsmInstead();
        return;
      }
      this.external.set({ code, source, status: 'error', places: [] });
    }
  }

  private async loadOsmInstead(): Promise<void> {
    const code = `osm:${this.area()}`;
    this.external.set({ code, source: 'osm', status: 'loading', places: [] });
    try {
      const places = await firstValueFrom(this.osmPlaces(this.osmDistrictCode()));
      if (this.external().code === code) this.external.set({ code, source: 'osm', status: 'ready', places });
    } catch {
      if (this.external().code === code) this.external.set({ code, source: 'osm', status: 'error', places: [] });
    }
  }

  /** OpenStreetMap places in a district (cached per district; failures are not cached). */
  private osmPlaces(code: string): Observable<ExternalPlace[]> {
    let request = this.osmRequests.get(code);
    if (!request) {
      request = this.http.get<Omit<ExternalPlace, 'source' | 'url'>[]>(`${this.baseUrl}/${encodeURIComponent(code)}/osm-places`).pipe(
        map((places) => places.map((p) => ({ ...p, source: 'osm' as const, url: `https://www.openstreetmap.org/${p.id}` }))),
        catchError((error) => {
          this.osmRequests.delete(code);
          return throwError(() => error);
        }),
        shareReplay(1)
      );
      this.osmRequests.set(code, request);
    }
    return request;
  }

  private loadArea(): string {
    try {
      return localStorage.getItem(AREA_KEY) || HOME_AREA;
    } catch {
      return HOME_AREA;
    }
  }
}
