export interface Place {
  id: number;
  name: string;
  category: string;
  description: string;
  openingHours: string;
  travelTips: string;
  visitDuration: string;
  latitude: number;
  longitude: number;
  imageUrl: string;
  distanceFromHomeKm: number;
  // Optional Tamil translations (empty when not provided).
  nameTa: string;
  descriptionTa: string;
  openingHoursTa: string;
  travelTipsTa: string;
  // Optional Sinhala translations (empty or missing when not provided).
  nameSi?: string;
  descriptionSi?: string;
  openingHoursSi?: string;
  travelTipsSi?: string;
  averageRating: number | null;
  reviewCount: number;
  /** ISO 3166-2 district code, e.g. "LK-41" (Jaffna). */
  district: string;
  /** Marked popular by the administrator. */
  isPopular: boolean;
  /** Hidden from visitors by the administrator (only admins ever receive hidden places). */
  isHidden?: boolean;
  /**
   * Set for a place that is not in our database (a Google or OpenStreetMap place added to the day plan).
   * Such places have id 0; use planKey() and placeLink() instead of the id.
   */
  external?: { source: 'google' | 'osm'; id: string; url: string } | null;
}

export type PlaceUpsert = Omit<Place, 'id' | 'distanceFromHomeKm' | 'averageRating' | 'reviewCount' | 'external' | 'isHidden'>;

export interface Review {
  id: number;
  placeId: number;
  visitorName: string;
  rating: number;
  comment: string;
  createdAtUtc: string;
}

export interface AdminReview extends Review {
  placeName: string;
}

export interface ReviewCreate {
  visitorName: string;
  rating: number;
  comment: string;
}
