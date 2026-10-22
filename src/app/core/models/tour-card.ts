import { Place } from './place.model';
import { ExternalPlace } from './district.model';

export type PhotoCredit = { name: string; url: string; license?: string };

/** One place shown to visitors: one of our own places, or an extra place from Google Places / OpenStreetMap. */
export type TourCard =
  | {
      kind: 'ours';
      key: string;
      place: Place;
      /** Straight-line km from the area centre. */
      km: number;
      /** Key used to look up and remember a Wikimedia photo for the card. */
      photoKey: string;
      /** Our own photo, else the matching Google place's photo, else a Wikimedia photo. */
      photoUrl: string | null;
      photoCredit: PhotoCredit | null;
      /** Google's rating, shown when visitors have not reviewed the place here yet. */
      googleRating: number | null;
      googleRatingCount: number | null;
      score: number;
    }
  | {
      kind: 'external';
      key: string;
      place: ExternalPlace;
      /** The same place as a plan stop / map pin. */
      planPlace: Place;
      photoKey: string;
      /** Google's photo, else a Wikimedia photo. */
      photoUrl: string | null;
      photoCredit: PhotoCredit | null;
      /** Details page inside the site (Google places), or null to link out (OpenStreetMap). */
      link: string[] | null;
      km: number;
      score: number;
    };
