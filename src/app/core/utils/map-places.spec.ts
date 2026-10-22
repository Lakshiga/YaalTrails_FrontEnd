import { Place } from '../models/place.model';
import { District, HOME_AREA, ExternalPlace } from '../models/district.model';
import {
  bestScore,
  nameSimilarity,
  samePlaceScore,
  isInSriLanka,
  matchExternal,
  isPopularPlace,
  nearestDistrict,
  externalNotInList,
  popularPlaces,
  selectMapPlaces,
  shortText,
  sortByDistance
} from './map-places';

const HOME = { latitude: 9.6615, longitude: 80.0255 };
const HOME_OPTIONS = { area: HOME_AREA, home: HOME, radiusKm: 25 };

function place(overrides: Partial<Place>): Place {
  return {
    id: 1,
    name: 'Place',
    category: 'Heritage',
    description: '',
    openingHours: '',
    travelTips: '',
    visitDuration: '',
    latitude: HOME.latitude,
    longitude: HOME.longitude,
    imageUrl: '',
    distanceFromHomeKm: 0,
    nameTa: '',
    descriptionTa: '',
    openingHoursTa: '',
    travelTipsTa: '',
    averageRating: null,
    reviewCount: 0,
    district: 'LK-41',
    isPopular: false,
    ...overrides
  };
}

function osm(overrides: Partial<ExternalPlace>): ExternalPlace {
  return {
    id: 'node/1', source: 'osm', name: 'OSM place', nameTa: '', category: 'Nature', kind: 'beach',
    latitude: 9.7, longitude: 80.0, notable: false, url: 'https://www.openstreetmap.org/node/1', ...overrides
  };
}

describe('map-places', () => {
  const fort = place({ id: 1, name: 'Fort', category: 'Heritage', latitude: 9.6620, longitude: 80.0080, distanceFromHomeKm: 1.9 });
  const kovil = place({ id: 2, name: 'Kovil', category: 'Religious', latitude: 9.6750, longitude: 80.0290, distanceFromHomeKm: 1.5 });
  const beach = place({ id: 3, name: 'Beach', category: 'Nature', latitude: 9.7600, longitude: 79.8900, distanceFromHomeKm: 18.4 });
  const noCoords = place({ id: 4, name: 'Unknown', category: 'Heritage', latitude: 0, longitude: 0 });
  const pointPedro = place({ id: 5, name: 'Point Pedro', category: 'Heritage', latitude: 9.8167, longitude: 80.2333, distanceFromHomeKm: 28.6 });
  const kandyTemple = place({ id: 6, name: 'Temple', category: 'Religious', latitude: 7.2936, longitude: 80.6413, district: 'LK-21' });
  const kandyGarden = place({ id: 7, name: 'Garden', category: 'Nature', latitude: 7.2690, longitude: 80.5970, district: 'LK-21' });
  const all = [fort, kovil, beach, noCoords, pointPedro, kandyTemple, kandyGarden];

  describe('selectMapPlaces', () => {
    it('keeps Jaffna places within the radius for the home area and counts the rest', () => {
      const result = selectMapPlaces(all, 'All', HOME_OPTIONS);
      expect(result.places.map((p) => p.id)).toEqual([1, 2, 3]);
      expect(result.invalidCount).toBe(1);
      expect(result.outsideCount).toBe(1);
    });

    it('keeps every place of a district, however far from Jaffna', () => {
      const result = selectMapPlaces(all, 'All', { ...HOME_OPTIONS, area: 'LK-21' });
      expect(result.places).toEqual([kandyTemple, kandyGarden]);
      expect(result.outsideCount).toBe(0);
    });

    it('filters by category', () => {
      expect(selectMapPlaces(all, 'Religious', HOME_OPTIONS).places).toEqual([kovil]);
      expect(selectMapPlaces(all, 'Religious', { ...HOME_OPTIONS, area: 'LK-21' }).places).toEqual([kandyTemple]);
    });

    it('only counts hidden places in the selected category', () => {
      const result = selectMapPlaces(all, 'Heritage', HOME_OPTIONS);
      expect(result.places).toEqual([fort]);
      expect(result.invalidCount).toBe(1);
      expect(result.outsideCount).toBe(1);
    });

    it('returns an empty selection for an area or category with no places', () => {
      expect(selectMapPlaces(all, 'Cultural', HOME_OPTIONS)).toEqual({ places: [], invalidCount: 0, outsideCount: 0 });
      expect(selectMapPlaces(all, 'All', { ...HOME_OPTIONS, area: 'LK-11' }).places).toEqual([]);
    });
  });

  describe('sortByDistance', () => {
    it('uses the server distance from home when there is no origin', () => {
      expect(sortByDistance([fort, kovil, beach], null)).toEqual([
        { place: kovil, km: 1.5 },
        { place: fort, km: 1.9 },
        { place: beach, km: 18.4 }
      ]);
    });

    it('measures from the origin when given, nearest first', () => {
      const nearBeach = { latitude: 9.7590, longitude: 79.8910 };
      const rows = sortByDistance([fort, kovil, beach], nearBeach);
      expect(rows.map((r) => r.place.id)).toEqual([3, 1, 2]);
      expect(rows[0].km).toBeLessThan(0.5);
    });
  });

  describe('popular places', () => {
    const curated = place({ id: 10, name: 'Curated', isPopular: true });
    const loved = place({ id: 11, name: 'Loved', averageRating: 4.6, reviewCount: 5 });
    const liked = place({ id: 12, name: 'Liked', averageRating: 4.2, reviewCount: 3 });
    const fewReviews = place({ id: 13, name: 'Few reviews', averageRating: 5, reviewCount: 2 });
    const lowRated = place({ id: 14, name: 'Low rated', averageRating: 3.5, reviewCount: 20 });

    it('counts curated places and places rated 4+ by at least 3 visitors', () => {
      expect(isPopularPlace(curated)).toBeTrue();
      expect(isPopularPlace(loved)).toBeTrue();
      expect(isPopularPlace(fewReviews)).toBeFalse();
      expect(isPopularPlace(lowRated)).toBeFalse();
    });

    it('ranks curated places first, then by rating, and respects the limit', () => {
      const ranked = popularPlaces([liked, lowRated, loved, fewReviews, curated], 10);
      expect(ranked.map((p) => p.id)).toEqual([10, 11, 12]);
      expect(popularPlaces([liked, loved, curated], 2).map((p) => p.id)).toEqual([10, 11]);
    });
  });

  describe('externalNotInList', () => {
    it('drops OpenStreetMap places that match one of ours by name or position', () => {
      const sameName = osm({ id: 'node/1', name: '  fort ', latitude: 9.70, longitude: 80.03 });
      const samePlace = osm({ id: 'way/2', name: 'Kovil gopuram', latitude: 9.6751, longitude: 80.0291 });
      const extra = osm({ id: 'node/3', name: 'Lighthouse', latitude: 9.82, longitude: 80.24 });
      const broken = osm({ id: 'node/4', name: 'Nowhere', latitude: 0, longitude: 0 });
      expect(externalNotInList([sameName, samePlace, extra, broken], [fort, kovil])).toEqual([extra]);
    });
  });

  describe('matching our places with Google results', () => {
    // Real pairs: our seed data vs the names Google uses, a few hundred metres apart.
    const ours = (name: string, latitude: number, longitude: number) => place({ id: 99, name, latitude, longitude });
    const google = (name: string, latitude: number, longitude: number) => osm({ id: name, source: 'google', name, latitude, longitude });

    const pairs: [string, [number, number], string, [number, number]][] = [
      ['Jaffna Dutch Fort', [9.6620, 80.0080], 'Jaffna Fort', [9.6611, 80.0097]],
      ['Nallur Kandaswamy Kovil', [9.6685, 80.0272], 'Nallur Kandaswamy Temple', [9.6744, 80.0294]],
      ['Nallur Kandaswamy Kovil', [9.6685, 80.0272], 'Nallur Kandasamy Kovil', [9.6744, 80.0294]],
      ["St. Mary's Cathedral, Jaffna", [9.6650, 80.0130], "St. Mary's Church", [9.6672, 80.0101]],
      ['Casuarina Beach, Karainagar', [9.7600, 79.8900], 'Casuarina Beach', [9.7531, 79.8846]],
      ['Kankesanthurai (KKS) Beach', [9.8150, 80.0420], 'KKS Beach', [9.8172, 80.0391]],
      ['Keerimalai Naguleswaram Kovil & Natural Springs', [9.8207, 80.0090], 'Naguleswaram Temple', [9.8170, 80.0071]],
      ['Muthirai Santhai (Jaffna Central Market)', [9.6600, 80.0170], 'Jaffna Market', [9.6612, 80.0201]]
    ];

    for (const [ourName, [lat1, lng1], googleName, [lat2, lng2]] of pairs) {
      it(`treats "${googleName}" as our "${ourName}"`, () => {
        const ourPlace = ours(ourName, lat1, lng1);
        const result = google(googleName, lat2, lng2);
        expect(samePlaceScore(result, ourPlace)).toBeGreaterThan(0);
        expect(externalNotInList([result], [ourPlace])).toEqual([]);
        expect(matchExternal(ourPlace, [result])).toBe(result);
      });
    }

    it('keeps different places nearby apart', () => {
      expect(samePlaceScore(google('Jaffna Public Library', 9.6610, 80.0110), ours('Jaffna Dutch Fort', 9.6620, 80.0080))).toBe(0);
      expect(samePlaceScore(google('Nallur Raja Maha Vihara', 9.6700, 80.0300), ours('Nallur Kandaswamy Kovil', 9.6685, 80.0272))).toBe(0);
      expect(samePlaceScore(google('Jaffna Archaeological Museum', 9.6650, 80.0150), ours('Jaffna Dutch Fort', 9.6620, 80.0080))).toBe(0);
    });

    it('does not match the same name far away', () => {
      expect(samePlaceScore(google('Jaffna Fort', 9.66, 80.01), ours('Jaffna Fort', 7.29, 80.63))).toBe(0);
    });

    it('never matches places of different kinds', () => {
      expect(nameSimilarity('Jaffna Fort', 'Jaffna Beach')).toBe(0);
      expect(nameSimilarity('Jaffna Dutch Fort', 'Jaffna Fort')).toBeGreaterThanOrEqual(0.6);
    });

    it('picks the closest match when several results look alike', () => {
      const fortPlace = ours('Jaffna Dutch Fort', 9.6620, 80.0080);
      const farther = google('Jaffna Fort', 9.6700, 80.0200);
      const onTop = google('Jaffna Fort ramparts', 9.6621, 80.0081);
      expect(matchExternal(fortPlace, [farther, onTop])).toBe(onTop);
    });
  });

  describe('matchExternal', () => {
    it('finds the external place that is one of ours, by name or position', () => {
      const byName = osm({ id: 'g1', name: 'FORT ', latitude: 9.70, longitude: 80.03, photoUrl: 'https://photo/fort' });
      const byPosition = osm({ id: 'g2', name: 'Kovil gopuram', latitude: 9.6751, longitude: 80.0291 });
      const other = osm({ id: 'g3', name: 'Lighthouse', latitude: 9.82, longitude: 80.24 });
      expect(matchExternal(fort, [other, byName])).toBe(byName);
      expect(matchExternal(kovil, [other, byPosition])).toBe(byPosition);
      expect(matchExternal(beach, [other, byName, byPosition])).toBeNull();
    });
  });

  describe('bestScore', () => {
    it('puts curated popular places first, then well-rated places with many ratings', () => {
      const curated = bestScore({ popular: true, rating: null, ratingCount: null });
      const famous = bestScore({ popular: false, rating: 4.5, ratingCount: 4000 });
      const fewRatings = bestScore({ popular: false, rating: 5, ratingCount: 3 });
      const unrated = bestScore({ popular: false, rating: null, ratingCount: null });
      expect(curated).toBeGreaterThan(famous);
      expect(famous).toBeGreaterThan(fewRatings);
      expect(fewRatings).toBeGreaterThan(unrated);
      expect(unrated).toBe(0);
    });
  });

  describe('nearestDistrict', () => {
    const districts: District[] = [
      { code: 'LK-41', name: 'Jaffna', nameTa: '', latitude: 9.6615, longitude: 80.0255 },
      { code: 'LK-21', name: 'Kandy', nameTa: '', latitude: 7.2906, longitude: 80.6337 },
      { code: 'LK-11', name: 'Colombo', nameTa: '', latitude: 6.9271, longitude: 79.8612 }
    ];

    it('picks the district with the closest capital', () => {
      expect(nearestDistrict(districts, { latitude: 7.2690, longitude: 80.5970 })?.code).toBe('LK-21');
      expect(nearestDistrict(districts, { latitude: 9.80, longitude: 80.20 })?.code).toBe('LK-41');
    });

    it('returns null without districts', () => {
      expect(nearestDistrict([], HOME)).toBeNull();
    });
  });

  it('isInSriLanka accepts the island and rejects nearby countries', () => {
    expect(isInSriLanka(HOME)).toBeTrue();
    expect(isInSriLanka({ latitude: 5.9210, longitude: 80.5890 })).toBeTrue(); // Dondra Head
    expect(isInSriLanka({ latitude: 13.0827, longitude: 80.2707 })).toBeFalse(); // Chennai
    expect(isInSriLanka({ latitude: 4.1755, longitude: 73.5093 })).toBeFalse(); // Malé
  });

  describe('shortText', () => {
    it('leaves short text alone', () => {
      expect(shortText('  A quiet   beach. ')).toBe('A quiet beach.');
    });

    it('cuts long text at a word boundary and adds an ellipsis', () => {
      const text = 'The historic Dutch fort overlooks the lagoon and was rebuilt in stone during the seventeenth century.';
      const result = shortText(text, 40);
      expect(result.endsWith('…')).toBeTrue();
      expect(result.length).toBeLessThanOrEqual(41);
      expect(text.startsWith(result.slice(0, -1))).toBeTrue();
    });
  });
});
