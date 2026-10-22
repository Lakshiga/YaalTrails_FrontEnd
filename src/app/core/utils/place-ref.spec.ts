import { ExternalPlace } from '../models/district.model';
import { externalLink, externalPath, externalToPlace, placeLink, placePath, planKey } from './place-ref';

const googleFort: ExternalPlace = {
  id: 'ChIJ_fort', source: 'google', name: 'Old Fort', nameTa: '', category: 'Heritage', kind: 'historical_landmark',
  latitude: 9.70, longitude: 80.05, notable: true, url: 'https://maps.google.com/?cid=1', rating: 4.4, ratingCount: 1200,
  photoUrl: 'https://photo/fort', photoCredit: null
};
const osmBeach: ExternalPlace = {
  id: 'node/42', source: 'osm', name: 'Quiet Beach', nameTa: '', category: 'Nature', kind: 'beach',
  latitude: 9.75, longitude: 80.10, notable: false, url: 'https://www.openstreetmap.org/node/42'
};

describe('place-ref', () => {
  it('wraps an external place as a plan stop with a sensible visit length', () => {
    const place = externalToPlace(googleFort, 'LK-41');
    expect(place.id).toBe(0);
    expect(place.name).toBe('Old Fort');
    expect(place.imageUrl).toBe('https://photo/fort');
    expect(place.visitDuration).toBe('1 hour');
    expect(place.district).toBe('LK-41');
    expect(place.distanceFromHomeKm).toBeGreaterThan(0);
    expect(place.external).toEqual({ source: 'google', id: 'ChIJ_fort', url: 'https://maps.google.com/?cid=1' });
  });

  it('gives every stop a distinct key', () => {
    const ours = { ...externalToPlace(googleFort), id: 7, external: null };
    expect(planKey(ours)).toBe('p:7');
    expect(planKey(externalToPlace(googleFort))).toBe('google:ChIJ_fort');
    expect(planKey(externalToPlace(osmBeach))).toBe('osm:node/42');
  });

  it('links our places and Google places to pages in the site, but not OpenStreetMap places', () => {
    const ours = { ...externalToPlace(googleFort), id: 7, external: null };
    expect(placeLink(ours)).toEqual(['/places', '7']);
    expect(placeLink(externalToPlace(googleFort))).toEqual(['/places', 'google', 'ChIJ_fort']);
    expect(placeLink(externalToPlace(osmBeach))).toBeNull();
    expect(placePath(externalToPlace(googleFort))).toBe('/places/google/ChIJ_fort');
    expect(externalLink(osmBeach)).toBeNull();
    expect(externalPath({ ...googleFort, id: 'a/b' })).toBe('/places/google/a%2Fb');
  });
});
