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
  averageRating: number | null;
  reviewCount: number;
}

export type PlaceUpsert = Omit<Place, 'id' | 'distanceFromHomeKm' | 'averageRating' | 'reviewCount'>;

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
