import { googleMapsDirectionsUrl, hasValidCoordinates, haversineKm, isWithinRadius, roundKm } from './geo';

const JAFFNA = { latitude: 9.6615, longitude: 80.0255 };

describe('geo', () => {
  describe('haversineKm', () => {
    it('is zero for the same point', () => {
      expect(haversineKm(JAFFNA, JAFFNA)).toBe(0);
    });

    it('measures one degree of latitude as about 111.2 km', () => {
      expect(haversineKm({ latitude: 9, longitude: 80 }, { latitude: 10, longitude: 80 })).toBeCloseTo(111.19, 1);
    });

    it('is symmetric', () => {
      const other = { latitude: 9.8207, longitude: 80.0167 };
      expect(haversineKm(JAFFNA, other)).toBeCloseTo(haversineKm(other, JAFFNA), 10);
    });
  });

  it('roundKm rounds to 0.1 km', () => {
    expect(roundKm(12.345)).toBe(12.3);
    expect(roundKm(12.35)).toBe(12.4);
  });

  describe('hasValidCoordinates', () => {
    it('accepts real coordinates', () => {
      expect(hasValidCoordinates(JAFFNA)).toBeTrue();
    });

    it('rejects missing, non-finite and out-of-range values', () => {
      expect(hasValidCoordinates(null)).toBeFalse();
      expect(hasValidCoordinates(undefined)).toBeFalse();
      expect(hasValidCoordinates({ latitude: 9.66 })).toBeFalse();
      expect(hasValidCoordinates({ latitude: NaN, longitude: 80 })).toBeFalse();
      expect(hasValidCoordinates({ latitude: 9.66, longitude: Infinity })).toBeFalse();
      expect(hasValidCoordinates({ latitude: 91, longitude: 80 })).toBeFalse();
      expect(hasValidCoordinates({ latitude: 9.66, longitude: -181 })).toBeFalse();
    });

    it('treats (0, 0) as not set', () => {
      expect(hasValidCoordinates({ latitude: 0, longitude: 0 })).toBeFalse();
    });
  });

  describe('isWithinRadius', () => {
    it('includes points inside the radius and excludes points beyond it', () => {
      // 0.2° of latitude ≈ 22.2 km, 0.25° ≈ 27.8 km.
      expect(isWithinRadius(JAFFNA, { latitude: JAFFNA.latitude + 0.2, longitude: JAFFNA.longitude }, 25)).toBeTrue();
      expect(isWithinRadius(JAFFNA, { latitude: JAFFNA.latitude + 0.25, longitude: JAFFNA.longitude }, 25)).toBeFalse();
    });
  });

  describe('googleMapsDirectionsUrl', () => {
    it('links to the destination and lets Google use the device location when there is no origin', () => {
      expect(googleMapsDirectionsUrl({ latitude: 9.6685, longitude: 80.0074 })).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=9.6685,80.0074'
      );
    });

    it('includes the origin when given', () => {
      expect(googleMapsDirectionsUrl({ latitude: 9.6685, longitude: 80.0074 }, JAFFNA)).toBe(
        'https://www.google.com/maps/dir/?api=1&destination=9.6685,80.0074&origin=9.6615,80.0255'
      );
    });
  });
});
