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
}

export type PlaceUpsert = Omit<Place, 'id' | 'distanceFromHomeKm'>;
