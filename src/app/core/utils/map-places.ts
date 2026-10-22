import { Place } from '../models/place.model';
import { District, HOME_AREA, JAFFNA_DISTRICT, ExternalPlace } from '../models/district.model';
import { LatLng, hasValidCoordinates, haversineKm, isWithinRadius, roundKm } from './geo';

export interface AreaOptions {
  /** HOME_AREA or a district code. */
  area: string;
  home: LatLng;
  radiusKm: number;
}

export interface MapPlaceSelection {
  /** Places in the area and category with valid coordinates. */
  places: Place[];
  /** Places in the area and category hidden because their coordinates are missing or invalid. */
  invalidCount: number;
  /** Jaffna places hidden from the home area because they lie beyond the radius. */
  outsideCount: number;
}

/**
 * Picks the places to show for an area and category ('All' for every category).
 * The home area holds Jaffna district places within the radius of home; a district holds its own places.
 */
export function selectMapPlaces(all: Place[], category: string, options: AreaOptions): MapPlaceSelection {
  const { area, home, radiusKm } = options;
  const isHome = area === HOME_AREA;
  const result: MapPlaceSelection = { places: [], invalidCount: 0, outsideCount: 0 };
  for (const place of all) {
    if (place.district !== (isHome ? JAFFNA_DISTRICT : area)) continue;
    if (category !== 'All' && place.category !== category) continue;
    if (!hasValidCoordinates(place)) result.invalidCount++;
    else if (isHome && !isWithinRadius(home, place, radiusKm)) result.outsideCount++;
    else result.places.push(place);
  }
  return result;
}

export interface PlaceWithDistance {
  place: Place;
  /** Straight-line distance in km. */
  km: number;
}

/**
 * Pairs each place with its straight-line distance from origin, nearest first.
 * With no origin, uses the server's distance from the home reference point.
 */
export function sortByDistance(places: Place[], origin: LatLng | null): PlaceWithDistance[] {
  return places
    .map((place) => ({ place, km: origin ? roundKm(haversineKm(origin, place)) : place.distanceFromHomeKm }))
    .sort((a, b) => a.km - b.km);
}

/** Popular = marked by the administrator, or well rated by at least 3 visitors. */
export function isPopularPlace(place: Pick<Place, 'isPopular' | 'averageRating' | 'reviewCount'>): boolean {
  return place.isPopular || (place.reviewCount >= 3 && (place.averageRating ?? 0) >= 4);
}

/** The most popular places: curated ones first, then by rating and number of reviews. */
export function popularPlaces(places: Place[], limit: number): Place[] {
  return places
    .filter(isPopularPlace)
    .sort(
      (a, b) =>
        Number(b.isPopular) - Number(a.isPopular) ||
        (b.averageRating ?? 0) - (a.averageRating ?? 0) ||
        b.reviewCount - a.reviewCount ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit);
}

// ---------- Matching our places with Google / OpenStreetMap results ----------

/** Words for the same kind of place in different spellings or languages (Google often says "Temple" for a kovil). */
const SYNONYMS: Record<string, string> = {
  kovil: 'temple', koil: 'temple', kovilu: 'temple', alayam: 'temple', devalaya: 'temple', devale: 'temple', vihara: 'temple',
  viharaya: 'temple', vihare: 'temple', mandir: 'temple', shrine: 'temple',
  cathedral: 'church', basilica: 'church', chapel: 'church',
  santhai: 'market', bazaar: 'market',
  springs: 'spring', tank: 'lake', kulam: 'lake', wewa: 'lake', reservoir: 'lake',
  falls: 'waterfall', ella: 'waterfall',
  st: 'saint', sri: 'saint', shri: 'saint'
};

/** Words that say what kind of place it is: they count for less, and two places of different kinds never match. */
const KIND_WORDS = new Set(['temple', 'church', 'mosque', 'market', 'fort', 'beach', 'museum', 'library', 'park', 'lake', 'spring', 'waterfall', 'bridge', 'lighthouse', 'garden', 'saint']);

const STOP_WORDS = new Set(['the', 'of', 'and', 'a', 'an', 'at', 'in', 'natural', 'view', 'old']);

/** Lower-case words of a name without punctuation or accents, with synonyms unified. */
export function nameTokens(name: string): string[] {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // drop accents left over after NFKD
    .toLowerCase()
    .replace(/['’`]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP_WORDS.has(t))
    .map((t) => SYNONYMS[t] ?? t);
}

/** Edit distance, stopping early once it exceeds max. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    if (Math.min(...row) > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/** Same word, allowing a typo-sized difference in longer words (Kandaswamy / Kandasamy). */
function sameToken(a: string, b: string): boolean {
  if (a === b) return true;
  const max = Math.min(a.length, b.length) >= 9 ? 2 : Math.min(a.length, b.length) >= 5 ? 1 : 0;
  return max > 0 && editDistance(a, b, max) <= max;
}

/**
 * How alike two place names are, 0–1 (weighted Dice overlap; kind words like "temple" weigh half).
 * Returns 0 when both names state a kind and the kinds differ ("Jaffna Fort" vs "Jaffna Beach").
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = [...new Set(nameTokens(a))];
  const tb = [...new Set(nameTokens(b))];
  const kindsA = ta.filter((t) => KIND_WORDS.has(t) && t !== 'saint');
  const kindsB = tb.filter((t) => KIND_WORDS.has(t) && t !== 'saint');
  if (kindsA.length > 0 && kindsB.length > 0 && !kindsA.some((k) => kindsB.includes(k))) return 0;

  const weight = (t: string) => (KIND_WORDS.has(t) ? 0.5 : 1);
  const total = [...ta, ...tb].reduce((sum, t) => sum + weight(t), 0);
  if (total === 0) return 0;
  const common = ta.filter((t) => tb.some((u) => sameToken(t, u))).reduce((sum, t) => sum + weight(t), 0);
  return (2 * common) / total;
}

/** Names this alike, this close together, are taken to be the same place. */
const SIMILAR_NAME = 0.6;
/** Our seeded coordinates are estimates, so a similar name may sit a little way off. */
const SIMILAR_NAME_KM = 3;
/** Exactly the same name (after normalising) still counts this far apart. */
const SAME_NAME_KM = 15;
/** Anything this close is the same place whatever it is called. */
const SAME_SPOT_KM = 0.15;

/** How confidently an external place is one of ours: 0 = different, higher = surer. */
export function samePlaceScore(external: Pick<ExternalPlace, 'name' | 'latitude' | 'longitude'>, ours: Pick<Place, 'name' | 'latitude' | 'longitude'>): number {
  if (!hasValidCoordinates(external)) return 0;
  const km = hasValidCoordinates(ours) ? haversineKm(external, ours) : Infinity;
  const similarity = nameSimilarity(external.name, ours.name);
  if (km <= SAME_SPOT_KM) return 2 + similarity;
  if (nameTokens(external.name).join(' ') === nameTokens(ours.name).join(' ') && km <= SAME_NAME_KM) return 2;
  if (similarity >= SIMILAR_NAME && km <= SIMILAR_NAME_KM) return similarity;
  return 0;
}

/** External places (Google/OpenStreetMap) that are not one of ours. */
export function externalNotInList(external: ExternalPlace[], ours: Place[]): ExternalPlace[] {
  return external.filter((e) => hasValidCoordinates(e) && !ours.some((p) => samePlaceScore(e, p) > 0));
}

/** The external place that best matches one of ours, if any — used to borrow its photo and rating. */
export function matchExternal(place: Place, external: ExternalPlace[]): ExternalPlace | null {
  let best: ExternalPlace | null = null;
  let bestScore = 0;
  for (const e of external) {
    const score = samePlaceScore(e, place);
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/**
 * "Best first" ordering score: curated popular places lead, then places rated well by many people.
 * A 4.5★ place with 1,000 ratings scores 4.5 × 3 = 13.5; one with 10 ratings scores about 4.7.
 */
export function bestScore(item: { popular: boolean; rating: number | null | undefined; ratingCount: number | null | undefined }): number {
  const rating = item.rating ?? 0;
  const count = Math.max(0, item.ratingCount ?? 0);
  return (item.popular ? 100 : 0) + rating * Math.log10(1 + count);
}

/** The district whose capital is closest to the point — a quick guess, not a boundary check. */
export function nearestDistrict(districts: District[], point: LatLng): District | null {
  let best: District | null = null;
  let bestKm = Infinity;
  for (const district of districts) {
    const km = haversineKm(point, district);
    if (km < bestKm) {
      best = district;
      bestKm = km;
    }
  }
  return best;
}

/** Rough bounding box of Sri Lanka (mirrors Districts.IsInSriLanka on the backend). */
export function isInSriLanka(point: LatLng): boolean {
  return point.latitude >= 5.85 && point.latitude <= 9.9 && point.longitude >= 79.45 && point.longitude <= 81.95;
}

/** Shortens text to about max characters, cutting at a word boundary. */
export function shortText(text: string, max = 120): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '') + '…';
}
