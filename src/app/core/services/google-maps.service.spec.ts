import { TestBed } from '@angular/core/testing';
import { GOOGLE_MAPS_CONFIG, GOOGLE_MAPS_SCRIPT_LOADER, GoogleMapsService, MapsConfig, fatalMapError } from './google-maps.service';

describe('GoogleMapsService', () => {
  let loadScript: jasmine.Spy<(src: string) => Promise<void>>;

  function create(config: MapsConfig): GoogleMapsService {
    loadScript = jasmine.createSpy('loadScript');
    TestBed.configureTestingModule({
      providers: [
        { provide: GOOGLE_MAPS_SCRIPT_LOADER, useValue: loadScript },
        { provide: GOOGLE_MAPS_CONFIG, useValue: config }
      ]
    });
    return TestBed.inject(GoogleMapsService);
  }

  it('falls back to OpenStreetMap when .env has no browser key, without loading Google', async () => {
    const service = create({ googleMapsApiKey: '', googleMapId: 'DEMO_MAP_ID' });
    expect(await service.load()).toBeFalse();
    expect(service.provider()).toBe('leaflet');
    expect(loadScript).not.toHaveBeenCalled();
  });

  it('loads the script with the key from .env (never asks the backend) and falls back if it fails', async () => {
    const service = create({ googleMapsApiKey: 'browser-key', googleMapId: 'my-map' });
    loadScript.and.rejectWith(new Error('blocked'));
    expect(await service.load()).toBeFalse();
    expect(loadScript).toHaveBeenCalledOnceWith(jasmine.stringContaining('key=browser-key'));
    expect(service.provider()).toBe('leaflet');
  });

  it('switches to OpenStreetMap when Google rejects the key later', () => {
    const service = create({ googleMapsApiKey: '', googleMapId: 'DEMO_MAP_ID' });
    service.fallBackToOpenStreetMap('key rejected');
    expect(service.provider()).toBe('leaflet');
  });

  it('only starts loading once', async () => {
    const service = create({ googleMapsApiKey: 'browser-key', googleMapId: 'DEMO_MAP_ID' });
    loadScript.and.rejectWith(new Error('blocked'));
    await Promise.all([service.load(), service.load()]);
    expect(loadScript).toHaveBeenCalledTimes(1);
  });

  it('recognises the console errors that break the map', () => {
    expect(fatalMapError('Google Maps JavaScript API error: BillingNotEnabledMapError https://developers.google.com/...')).toBe(
      'BillingNotEnabledMapError'
    );
    expect(fatalMapError('Google Maps JavaScript API error: RefererNotAllowedMapError')).toBe('RefererNotAllowedMapError');
    // Warnings that do not break the map, and unrelated errors, are ignored.
    expect(fatalMapError('Google Maps JavaScript API warning: RetiredVersion')).toBeNull();
    expect(fatalMapError('Google Maps JavaScript API error: SomethingHarmless')).toBeNull();
    expect(fatalMapError('TypeError: x is undefined')).toBeNull();
  });
});
