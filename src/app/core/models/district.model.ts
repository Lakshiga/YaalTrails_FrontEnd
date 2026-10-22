export interface District {
  /** ISO 3166-2 code, e.g. "LK-41". */
  code: string;
  name: string;
  nameTa: string;
  nameSi?: string;
  /** Approximate centre (the district capital). */
  latitude: number;
  longitude: number;
}

export type ExternalSource = 'google' | 'osm';

/** A tourist place from Google Places or OpenStreetMap — shown on the site but not stored in our database. */
export interface ExternalPlace {
  /** Google place ID, or an OSM id such as "node/123". */
  id: string;
  source: ExternalSource;
  name: string;
  nameTa: string;
  /** Sinhala name, when Google or OpenStreetMap has one. */
  nameSi?: string;
  category: string;
  /** Google's primary type or the OSM tag value, e.g. "waterfall". */
  kind: string;
  latitude: number;
  longitude: number;
  /** Well known: many Google reviews, or a Wikipedia/Wikidata link on OSM. */
  notable: boolean;
  /** The place on Google Maps or OpenStreetMap. */
  url: string;
  /** Google rating (1–5) and number of ratings, when known. */
  rating?: number | null;
  ratingCount?: number | null;
  /** First Google photo and the attribution Google requires next to it. */
  photoUrl?: string | null;
  photoCredit?: { name: string; url: string } | null;
}

/** The SRS "home area": places within the service radius of Jaffna town. Otherwise a district code. */
export const HOME_AREA = 'home';
export const JAFFNA_DISTRICT = 'LK-41';

/**
 * The province (1–9) of a district: the first digit of its ISO 3166-2 code is the province's number
 * (LK-1x Western, 2 Central, 3 Southern, 4 Northern, 5 Eastern, 6 North Western, 7 North Central, 8 Uva,
 * 9 Sabaragamuwa). Null for anything else.
 */
export function provinceOf(code: string): number | null {
  const digit = /^LK-(\d)\d$/.exec(code)?.[1];
  return digit ? Number(digit) : null;
}
