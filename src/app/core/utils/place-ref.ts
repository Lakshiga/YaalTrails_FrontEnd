import { Place } from '../models/place.model';
import { ExternalPlace, JAFFNA_DISTRICT } from '../models/district.model';
import { HOME_LOCATION } from '../models/home-reference';
import { haversineKm, roundKm } from './geo';

// Typical visit lengths for places we know little about.
const DEFAULT_VISIT: Record<string, string> = {
  Religious: '45 mins - 1 hour',
  Heritage: '1 hour',
  Cultural: '1 - 1.5 hours',
  Nature: '1 - 2 hours'
};

/** Identifies a place in the day plan: "p:12" for ours, "google:ChIJ…" / "osm:node/1" for external places. */
export function planKey(place: Place): string {
  return place.external ? `${place.external.source}:${place.external.id}` : `p:${place.id}`;
}

/** Router commands for the place's details page, or null when it has none (OpenStreetMap places). */
export function placeLink(place: Place): string[] | null {
  if (!place.external) return ['/places', String(place.id)];
  return place.external.source === 'google' ? ['/places', 'google', place.external.id] : null;
}

/** Router commands as a URL path, e.g. ['/places', 'google', 'ChIJ…'] → "/places/google/ChIJ…". */
function toPath(link: string[] | null): string | null {
  return link ? link.map((part, i) => (i === 0 ? part : encodeURIComponent(part))).join('/') : null;
}

/** The details page as a URL path (for map popups), or null. */
export function placePath(place: Place): string | null {
  return toPath(placeLink(place));
}

/** Router commands for an external place's details page (Google only). */
export function externalLink(place: ExternalPlace): string[] | null {
  return place.source === 'google' ? ['/places', 'google', place.id] : null;
}

/** An external place's details page as a URL path, or null. */
export function externalPath(place: ExternalPlace): string | null {
  return toPath(externalLink(place));
}

/**
 * Wraps an external place as a Place so it can join the day plan and appear on maps.
 * Only what the plan needs is kept; full details are fetched from Google when its page is opened.
 */
export function externalToPlace(external: ExternalPlace, district: string = JAFFNA_DISTRICT): Place {
  return {
    id: 0,
    name: external.name,
    category: external.category,
    description: '',
    openingHours: '',
    travelTips: '',
    visitDuration: DEFAULT_VISIT[external.category] ?? '1 hour',
    latitude: external.latitude,
    longitude: external.longitude,
    imageUrl: external.photoUrl ?? '',
    distanceFromHomeKm: roundKm(haversineKm(HOME_LOCATION, external)),
    nameTa: external.nameTa,
    descriptionTa: '',
    openingHoursTa: '',
    travelTipsTa: '',
    nameSi: external.nameSi ?? '',
    averageRating: external.rating ?? null,
    reviewCount: 0,
    district,
    isPopular: false,
    external: { source: external.source, id: external.id, url: external.url }
  };
}
