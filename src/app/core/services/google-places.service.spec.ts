import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE_URL } from '../config';
import { GooglePlaceLike, GooglePlacesService, categoryForGoogleTypes, googlePhotoUrl, splitBilingualName, toExternalPlace, toPlaceDetails } from './google-places.service';

describe('Google Places mapping', () => {
  it('maps Google place types onto the four categories, primary type first', () => {
    expect(categoryForGoogleTypes('hindu_temple', ['tourist_attraction'])).toBe('Religious');
    expect(categoryForGoogleTypes('historical_landmark', [])).toBe('Heritage');
    expect(categoryForGoogleTypes('museum', ['tourist_attraction'])).toBe('Cultural');
    expect(categoryForGoogleTypes('national_park', [])).toBe('Nature');
    expect(categoryForGoogleTypes('tourist_attraction', ['church', 'point_of_interest'])).toBe('Religious');
    expect(categoryForGoogleTypes(null, ['beach'])).toBe('Nature');
    expect(categoryForGoogleTypes('tourist_attraction', ['point_of_interest'])).toBe('Cultural');
  });

  const fort: GooglePlaceLike = {
    id: 'ChIJ123',
    name: 'Jaffna Fort',
    latitude: 9.66221234,
    longitude: 80.00851234,
    primaryType: 'historical_landmark',
    types: ['historical_landmark', 'tourist_attraction'],
    rating: 4.5,
    ratingCount: 4200,
    mapsUrl: 'https://maps.google.com/?cid=1',
    photos: [{ name: 'places/ChIJ123/photos/AbC', author: 'A. Photographer', authorUrl: 'https://example.com/a' }]
  };

  it('converts a Google place into the shared shape; the photo loads through our backend, not Google', () => {
    expect(toExternalPlace(fort)).toEqual({
      id: 'ChIJ123',
      source: 'google',
      name: 'Jaffna Fort',
      nameTa: '',
      nameSi: '',
      category: 'Heritage',
      kind: 'historical_landmark',
      latitude: 9.662212,
      longitude: 80.008512,
      notable: true,
      url: 'https://maps.google.com/?cid=1',
      rating: 4.5,
      ratingCount: 4200,
      photoUrl: `${API_BASE_URL}/google/photo?name=places%2FChIJ123%2Fphotos%2FAbC&maxWidth=480`,
      photoCredit: { name: 'A. Photographer', url: 'https://example.com/a' }
    });
  });

  it('handles places without photos, ratings or a Maps link', () => {
    const plain = toExternalPlace({ id: 'abc', name: 'Quiet beach', latitude: 9.7, longitude: 80.1, types: ['beach'] })!;
    expect(plain.category).toBe('Nature');
    expect(plain.notable).toBeFalse();
    expect(plain.photoUrl).toBeNull();
    expect(plain.rating).toBeNull();
    expect(plain.url).toContain('place_id:abc');
  });

  it('skips results without a name or location', () => {
    expect(toExternalPlace({ id: 'x', name: 'No location' })).toBeNull();
    expect(toExternalPlace({ id: 'y', latitude: 9, longitude: 80 })).toBeNull();
  });

  it('collects the details shown on the Google place page', () => {
    const details = toPlaceDetails({
      ...fort,
      address: 'Fort Rd, Jaffna',
      summary: 'A star-shaped Dutch fort.',
      hours: ['Monday: 8:00 AM – 6:00 PM'],
      website: 'https://fort.example',
      reviews: [
        { author: 'Ana', authorUrl: 'https://a', authorPhoto: 'https://p', rating: 5, text: 'Wonderful', when: 'a month ago' },
        { author: 'Bo', authorUrl: null, authorPhoto: null, rating: 4, text: '', when: '' }
      ]
    })!;
    expect(details.place.name).toBe('Jaffna Fort');
    expect(details.address).toBe('Fort Rd, Jaffna');
    expect(details.summary).toBe('A star-shaped Dutch fort.');
    expect(details.hours).toEqual(['Monday: 8:00 AM – 6:00 PM']);
    expect(details.phone).toBeNull();
    expect(details.photos).toEqual([{ url: googlePhotoUrl('places/ChIJ123/photos/AbC', 1200), credit: { name: 'A. Photographer', url: 'https://example.com/a' } }]);
    expect(details.reviews).toEqual([{ author: 'Ana', authorUrl: 'https://a', authorPhoto: 'https://p', rating: 5, text: 'Wonderful', when: 'a month ago' }]);
  });

  it('splits bilingual Google names into English and Tamil', () => {
    expect(splitBilingualName('செல்வச்சந்நிதி ஆலயம், தொண்டைமானாறு | Selvasannidhi Temple, Thondamanaru')).toEqual({
      name: 'Selvasannidhi Temple, Thondamanaru',
      nameTa: 'செல்வச்சந்நிதி ஆலயம், தொண்டைமானாறு',
      nameSi: ''
    });
    expect(splitBilingualName('Nilavarai, Natural underground water well | நிலாவரை')).toEqual({ name: 'Nilavarai, Natural underground water well', nameTa: 'நிலாவரை', nameSi: '' });
    expect(splitBilingualName('Jaffna Fort')).toEqual({ name: 'Jaffna Fort', nameTa: '', nameSi: '' });
    expect(splitBilingualName('நட்புமண் பூங்கா')).toEqual({ name: 'நட்புமண் பூங்கா', nameTa: 'நட்புமண் பூங்கா', nameSi: '' });
  });

  it('splits Sinhala names too, including three-language names', () => {
    expect(splitBilingualName('ශ්‍රී දළදා මාළිගාව | Temple of the Tooth')).toEqual({ name: 'Temple of the Tooth', nameTa: '', nameSi: 'ශ්‍රී දළදා මාළිගාව' });
    expect(splitBilingualName('Galle Fort | ගාල්ල කොටුව | காலி கோட்டை')).toEqual({ name: 'Galle Fort', nameTa: 'காலி கோட்டை', nameSi: 'ගාල්ල කොටුව' });
    expect(splitBilingualName('සීගිරිය')).toEqual({ name: 'සීගිරිය', nameTa: '', nameSi: 'සීගිරිය' });
  });
});

describe('GooglePlacesService (through the backend)', () => {
  let service: GooglePlacesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(GooglePlacesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks our backend for nearby places (never Google) and caches the answer', async () => {
    const first = service.nearby({ latitude: 9.6615, longitude: 80.0255 }, 25);
    const req = http.expectOne((r) => r.url === `${API_BASE_URL}/google/nearby`);
    expect(req.request.params.get('radiusKm')).toBe('25');
    req.flush([{ id: 'ChIJ1', name: 'Jaffna Fort', latitude: 9.66, longitude: 80.0, types: ['historical_landmark'], photos: [] }]);
    expect((await first).map((p) => p.name)).toEqual(['Jaffna Fort']);
    expect(service.available()).toBeTrue();
    await service.nearby({ latitude: 9.6615, longitude: 80.0255 }, 25);
    http.expectNone(`${API_BASE_URL}/google/nearby`);
  });

  it('marks Google unavailable when the backend has no key (503), so pages use OpenStreetMap', async () => {
    const result = service.nearby({ latitude: 9.6615, longitude: 80.0255 }, 25);
    http.expectOne((r) => r.url.endsWith('/google/nearby')).flush({}, { status: 503, statusText: 'Service Unavailable' });
    await expectAsync(result).toBeRejected();
    expect(service.available()).toBeFalse();
  });

  it('reads details and opening hours from one backend request; unknown places are null', async () => {
    const details = service.details('ChIJ1');
    const hours = service.weeklyHours('ChIJ1');
    http.expectOne(`${API_BASE_URL}/google/places/ChIJ1`).flush({
      id: 'ChIJ1', name: 'Fort', latitude: 9.66, longitude: 80.0,
      periods: [{ openDay: 1, openMinute: 480, closeDay: 1, closeMinute: 1080 }]
    });
    expect((await details)?.place.name).toBe('Fort');
    expect(await hours).toEqual([{ openDay: 1, openMinute: 480, closeDay: 1, closeMinute: 1080 }]);

    const missing = service.details('ChIJ404');
    http.expectOne(`${API_BASE_URL}/google/places/ChIJ404`).flush({}, { status: 404, statusText: 'Not Found' });
    expect(await missing).toBeNull();
  });
});
