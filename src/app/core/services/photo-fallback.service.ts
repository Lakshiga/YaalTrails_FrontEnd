import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { API_BASE_URL } from '../config';
import { LatLng, hasValidCoordinates } from '../utils/geo';

/** A freely licensed Wikimedia Commons photo and the attribution its licence requires. */
export interface FallbackPhoto {
  url: string;
  /** The file's page on Wikimedia Commons (author, licence, original). */
  pageUrl: string;
  author: string;
  license: string;
}

export interface PhotoRequest extends LatLng {
  /** planKey() of the place, e.g. "p:12" or "google:ChIJ…". */
  key: string;
  name: string;
}

// Small batches so the first cards get their photos quickly (the backend looks places up one at a time).
const BATCH_SIZE = 4;
const STORAGE_KEY = 'yaal_photo_cache';
const KEEP_FOUND_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP_MISSING_MS = 24 * 60 * 60 * 1000;

interface StoredResult {
  photo: FallbackPhoto | null;
  expires: number;
}

/**
 * Wikimedia photos for places that have none of their own (our seeded places, Google places without photos).
 * Results — including "no photo" — are remembered in this browser, so revisits show photos at once.
 */
@Injectable({ providedIn: 'root' })
export class PhotoFallbackService {
  private http = inject(HttpClient);
  private requested = new Set<string>();
  private stored: Record<string, StoredResult> = this.load();

  /** Photos found so far, by place key. Places without a match never appear here. */
  readonly photos = signal<Record<string, FallbackPhoto>>(this.foundInStorage());

  /** Keys being looked up right now — show a placeholder for these. */
  readonly pending = signal<ReadonlySet<string>>(new Set());

  photoFor(key: string): FallbackPhoto | null {
    return this.photos()[key] ?? null;
  }

  isPending(key: string): boolean {
    return this.pending().has(key);
  }

  /** Looks up photos for places not asked about before, in the given order. Safe to call repeatedly. */
  request(items: PhotoRequest[]): void {
    const fresh = items.filter((i) => !this.requested.has(i.key) && !this.isRemembered(i.key) && i.name && hasValidCoordinates(i));
    if (fresh.length === 0) return;
    fresh.forEach((i) => this.requested.add(i.key));
    this.setPending(fresh.map((i) => i.key), true);

    for (let start = 0; start < fresh.length; start += BATCH_SIZE) {
      const batch = fresh.slice(start, start + BATCH_SIZE);
      const keys = batch.map((i) => i.key);
      this.http
        .post<{ id: string; photo: FallbackPhoto }[]>(
          `${API_BASE_URL}/photos/lookup`,
          batch.map((i) => ({ id: i.key, name: i.name, latitude: i.latitude, longitude: i.longitude }))
        )
        .subscribe({
          next: (found) => {
            const byKey = new Map(found.map((f) => [f.id, f.photo]));
            if (byKey.size > 0) this.photos.update((photos) => ({ ...photos, ...Object.fromEntries(byKey) }));
            this.remember(keys.map((key) => [key, byKey.get(key) ?? null]));
            this.setPending(keys, false);
          },
          error: () => {
            // Let a later call try these places again.
            keys.forEach((key) => this.requested.delete(key));
            this.setPending(keys, false);
          }
        });
    }
  }

  private setPending(keys: string[], pending: boolean): void {
    this.pending.update((current) => {
      const next = new Set(current);
      keys.forEach((key) => (pending ? next.add(key) : next.delete(key)));
      return next;
    });
  }

  private isRemembered(key: string): boolean {
    return (this.stored[key]?.expires ?? 0) > Date.now();
  }

  private remember(results: [string, FallbackPhoto | null][]): void {
    const now = Date.now();
    for (const [key, photo] of results) {
      this.stored[key] = { photo, expires: now + (photo ? KEEP_FOUND_MS : KEEP_MISSING_MS) };
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stored));
    } catch {
      // Storage full or unavailable: photos still work for this visit.
    }
  }

  private load(): Record<string, StoredResult> {
    try {
      const all = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, StoredResult>;
      const now = Date.now();
      return Object.fromEntries(Object.entries(all).filter(([, r]) => r && r.expires > now));
    } catch {
      return {};
    }
  }

  private foundInStorage(): Record<string, FallbackPhoto> {
    return Object.fromEntries(
      Object.entries(this.stored).flatMap(([key, r]) => (r.photo ? [[key, r.photo] as [string, FallbackPhoto]] : []))
    );
  }
}
