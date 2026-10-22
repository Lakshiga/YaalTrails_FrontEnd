import { TestBed } from '@angular/core/testing';
import { GEOLOCATION, UserLocationService } from './user-location.service';

type Outcome = { coords: { latitude: number; longitude: number } } | { code: number };

/** A geolocation stub that answers every request with the given outcome. */
function fakeGeolocation(outcome: Outcome): Geolocation {
  return {
    getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => {
      if ('coords' in outcome) success(outcome as unknown as GeolocationPosition);
      else error?.(outcome as GeolocationPositionError);
    }
  } as Geolocation;
}

function setup(geolocation: Geolocation | null): UserLocationService {
  TestBed.configureTestingModule({ providers: [{ provide: GEOLOCATION, useValue: geolocation }] });
  return TestBed.inject(UserLocationService);
}

describe('UserLocationService', () => {
  it('starts idle without a position', () => {
    const service = setup(fakeGeolocation({ code: 1 }));
    expect(service.status()).toBe('idle');
    expect(service.position()).toBeNull();
    expect(service.origin()).toBeNull();
  });

  it('uses a position near Jaffna as the origin', () => {
    const service = setup(fakeGeolocation({ coords: { latitude: 9.6750, longitude: 80.0290 } }));
    service.locate();
    expect(service.status()).toBe('ready');
    expect(service.insideSriLanka()).toBeTrue();
    expect(service.kmFromHome()).toBeCloseTo(1.5, 0);
    expect(service.origin()).toEqual({ latitude: 9.6750, longitude: 80.0290 });
  });

  it('uses a position anywhere in Sri Lanka as the origin', () => {
    const service = setup(fakeGeolocation({ coords: { latitude: 6.9271, longitude: 79.8612 } })); // Colombo
    service.locate();
    expect(service.insideSriLanka()).toBeTrue();
    expect(service.kmFromHome()!).toBeGreaterThan(25);
    expect(service.origin()).toEqual({ latitude: 6.9271, longitude: 79.8612 });
  });

  it('does not use a position outside Sri Lanka', () => {
    const service = setup(fakeGeolocation({ coords: { latitude: 13.0827, longitude: 80.2707 } })); // Chennai
    service.locate();
    expect(service.status()).toBe('ready');
    expect(service.insideSriLanka()).toBeFalse();
    expect(service.origin()).toBeNull();
  });

  it('reports a denied permission', () => {
    const service = setup(fakeGeolocation({ code: 1 }));
    service.locate();
    expect(service.status()).toBe('denied');
    expect(service.position()).toBeNull();
  });

  it('reports other failures (unavailable, timeout) as unavailable', () => {
    const service = setup(fakeGeolocation({ code: 3 }));
    service.locate();
    expect(service.status()).toBe('unavailable');
  });

  it('reports browsers without geolocation as unsupported', () => {
    const service = setup(null);
    service.locate();
    expect(service.status()).toBe('unsupported');
  });

  it('forgets the position on clear', () => {
    const service = setup(fakeGeolocation({ coords: { latitude: 9.6750, longitude: 80.0290 } }));
    service.locate();
    service.clear();
    expect(service.status()).toBe('idle');
    expect(service.position()).toBeNull();
  });
});
