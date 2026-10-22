import { LatLng } from '../utils/geo';

// Mirrors the backend's reference point (JaffnaTourism.Api/Data/PlaceSeedData.cs) used for distance calculations.
export const PlaceSeedHome = {
  Latitude: 9.6615,
  Longitude: 80.0255
};

export const HOME_LOCATION: LatLng = { latitude: PlaceSeedHome.Latitude, longitude: PlaceSeedHome.Longitude };

// Mirrors PlaceSeedData.ServiceRadiusKm: the system only covers places this close to Jaffna town.
export const SERVICE_RADIUS_KM = 25;
