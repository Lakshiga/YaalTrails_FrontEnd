import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { API_BASE_URL } from '../config';
import { ExternalPlace } from '../models/district.model';
import { LatLng } from '../utils/geo';
import { WeeklyPeriod } from '../utils/opening-hours';

/** A place with this many Google ratings is marked "well known". */
const NOTABLE_RATINGS = 1000;

const RELIGIOUS = ['hindu_temple', 'buddhist_temple', 'church', 'mosque', 'synagogue', 'place_of_worship'];
const HERITAGE = ['historical_landmark', 'historical_place', 'monument', 'castle', 'fort', 'ruins'];
const CULTURAL = ['museum', 'art_gallery', 'cultural_center', 'cultural_landmark', 'performing_arts_theater'];
const NATURE = ['national_park', 'park', 'zoo', 'beach', 'natural_feature', 'hiking_area', 'botanical_garden', 'wildlife_park', 'aquarium'];

/** Maps Google place types onto the site's four categories (the primary type wins). */
export function categoryForGoogleTypes(primaryType: string | null | undefined, types: string[] | null | undefined): string {
  for (const type of [primaryType, ...(types ?? [])]) {
    if (!type) continue;
    if (RELIGIOUS.includes(type)) return 'Religious';
    if (HERITAGE.includes(type)) return 'Heritage';
    if (CULTURAL.includes(type)) return 'Cultural';
    if (NATURE.includes(type)) return 'Nature';
  }
  return 'Cultural';
}

/** A Google place as the backend returns it (GET api/google/nearby and api/google/places/{id}). */
export interface GooglePlaceLike {
  id: string;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  primaryType?: string | null;
  types?: string[] | null;
  rating?: number | null;
  ratingCount?: number | null;
  mapsUrl?: string | null;
  /** Photo resource names with the credit Google requires; images load through GET api/google/photo. */
  photos?: { name: string; author?: string | null; authorUrl?: string | null }[] | null;
  address?: string | null;
  summary?: string | null;
  hours?: string[] | null;
  periods?: WeeklyPeriod[] | null;
  website?: string | null;
  phone?: string | null;
  reviews?: GoogleReview[] | null;
}

/** The backend address that shows a Google place photo (it redirects to Google's key-free image URL). */
export function googlePhotoUrl(photoName: string, maxWidth: number): string {
  return `${API_BASE_URL}/google/photo?name=${encodeURIComponent(photoName)}&maxWidth=${maxWidth}`;
}

export interface GooglePhoto {
  url: string;
  credit: { name: string; url: string; license?: string } | null;
}

export interface GoogleReview {
  author: string;
  authorUrl: string | null;
  authorPhoto: string | null;
  rating: number | null;
  text: string;
  when: string;
}

/** Everything the Google place page shows. Fetched live each time — Google's terms only allow storing the place ID. */
export interface GooglePlaceDetails {
  place: ExternalPlace;
  address: string;
  summary: string;
  hours: string[];
  website: string | null;
  phone: string | null;
  photos: GooglePhoto[];
  reviews: GoogleReview[];
}

const TAMIL = /[\u0B80-\u0BFF]/;
const SINHALA = /[\u0D80-\u0DFF]/;
const LATIN = /[A-Za-z]/;

/**
 * Google often lists local places as "செல்வச்சந்நிதி ஆலயம் | Selvasannidhi Temple" or "ශ්‍රී දළදා මාළිගාව | Temple of
 * the Tooth": the English part becomes the name and the Tamil / Sinhala parts the translated names, so the site can
 * show the one that matches its language.
 */
export function splitBilingualName(name: string): { name: string; nameTa: string; nameSi: string } {
  const trimmed = name.trim();
  const parts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
  const only = (script: RegExp) => (script.test(trimmed) && !LATIN.test(trimmed) ? trimmed : '');
  if (parts.length < 2) return { name: trimmed, nameTa: only(TAMIL), nameSi: only(SINHALA) };
  const local = (p: string) => TAMIL.test(p) || SINHALA.test(p);
  const english = parts.find((p) => LATIN.test(p) && !local(p)) ?? parts.find((p) => LATIN.test(p)) ?? parts[0];
  return { name: english, nameTa: parts.find((p) => TAMIL.test(p)) ?? '', nameSi: parts.find((p) => SINHALA.test(p)) ?? '' };
}

export function toExternalPlace(place: GooglePlaceLike): ExternalPlace | null {
  if (!place.name || place.latitude == null || place.longitude == null) return null;
  const photo = place.photos?.[0];
  return {
    id: place.id,
    source: 'google',
    ...splitBilingualName(place.name),
    category: categoryForGoogleTypes(place.primaryType, place.types),
    kind: place.primaryType ?? 'tourist_attraction',
    latitude: Math.round(place.latitude * 1e6) / 1e6,
    longitude: Math.round(place.longitude * 1e6) / 1e6,
    notable: (place.ratingCount ?? 0) >= NOTABLE_RATINGS,
    url: place.mapsUrl ?? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(place.id)}`,
    rating: place.rating ?? null,
    ratingCount: place.ratingCount ?? null,
    photoUrl: photo ? googlePhotoUrl(photo.name, 480) : null,
    photoCredit: photo?.author ? { name: photo.author, url: photo.authorUrl ?? '' } : null
  };
}

export function toPlaceDetails(place: GooglePlaceLike): GooglePlaceDetails | null {
  const summary = toExternalPlace(place);
  if (!summary) return null;
  return {
    place: summary,
    address: place.address ?? '',
    summary: place.summary ?? '',
    hours: place.hours ?? [],
    website: place.website ?? null,
    phone: place.phone ?? null,
    photos: (place.photos ?? []).slice(0, 6).map((photo) => ({
      url: googlePhotoUrl(photo.name, 1200),
      credit: photo.author ? { name: photo.author, url: photo.authorUrl ?? '' } : null
    })),
    reviews: (place.reviews ?? []).filter((r) => r.text).slice(0, 5)
  };
}

/**
 * Google places through our backend (which holds the Google key): popular places near a point, a place's details
 * and its weekly opening hours. Nothing here talks to Google directly or needs the Google Maps script.
 */
@Injectable({ providedIn: 'root' })
export class GooglePlacesService {
  private http = inject(HttpClient);
  private baseUrl = `${API_BASE_URL}/google`;
  private cache = new Map<string, Promise<ExternalPlace[]>>();
  private detailsCache = new Map<string, Promise<GooglePlaceLike | null>>();

  /** False once the backend says it has no Google key (then the site uses OpenStreetMap places). */
  readonly available = signal<boolean | null>(null);

  /** Up to 20 popular places within radiusKm (max 50) of center. Rejects when Google is unavailable. */
  nearby(center: LatLng, radiusKm: number): Promise<ExternalPlace[]> {
    const key = `${center.latitude.toFixed(3)},${center.longitude.toFixed(3)},${radiusKm}`;
    let request = this.cache.get(key);
    if (!request) {
      request = this.get<GooglePlaceLike[]>(`${this.baseUrl}/nearby`, {
        lat: center.latitude,
        lng: center.longitude,
        radiusKm: Math.min(radiusKm, 50)
      }).then((places) => (places ?? []).map(toExternalPlace).filter((p): p is ExternalPlace => p !== null));
      request.catch(() => this.cache.delete(key)); // failures are not cached
      this.cache.set(key, request);
    }
    return request;
  }

  /** Full details of one Google place (null when Google has no such place). */
  async details(placeId: string): Promise<GooglePlaceDetails | null> {
    const place = await this.raw(placeId);
    return place ? toPlaceDetails(place) : null;
  }

  /** A place's weekly opening periods (null when Google does not list them). */
  async weeklyHours(placeId: string): Promise<WeeklyPeriod[] | null> {
    const place = await this.raw(placeId);
    return place?.periods?.length ? place.periods : null;
  }

  private raw(placeId: string): Promise<GooglePlaceLike | null> {
    let request = this.detailsCache.get(placeId);
    if (!request) {
      request = this.get<GooglePlaceLike>(`${this.baseUrl}/places/${encodeURIComponent(placeId)}`).catch((error: unknown) => {
        if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 400)) return null;
        throw error;
      });
      request.catch(() => this.detailsCache.delete(placeId));
      this.detailsCache.set(placeId, request);
    }
    return request;
  }

  private async get<T>(url: string, params?: Record<string, number>): Promise<T | null> {
    try {
      const result = await firstValueFrom(this.http.get<T>(url, { params }).pipe(timeout(20000)));
      this.available.set(true);
      return result;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 503) this.available.set(false);
      throw error;
    }
  }
}
