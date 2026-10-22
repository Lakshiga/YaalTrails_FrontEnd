import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RestrictedPlace, RestrictionService } from './restriction.service';
import { ExternalPlace } from '../models/district.model';
import { externalToPlace } from '../utils/place-ref';

const google = (id: string): ExternalPlace => ({
  id, source: 'google', name: `Place ${id}`, nameTa: '', category: 'Nature', kind: 'park', latitude: 9.7, longitude: 80.0, notable: false, url: 'u'
});
const entry = (id: number, externalId: string): RestrictedPlace => ({
  id, source: 'google', externalId, name: `Place ${externalId}`, latitude: 9.7, longitude: 80.0, district: 'LK-41', createdAtUtc: '2026-10-20T00:00:00Z'
});
const isList = (r: { url: string; method: string }) => r.method === 'GET' && r.url.endsWith('/restricted-places');

describe('RestrictionService', () => {
  let service: RestrictionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(RestrictionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the list once and recognises hidden places and plan stops', async () => {
    const first = service.load();
    void service.load();
    http.expectOne(isList).flush({ places: [entry(1, 'ChIJ_bad')], hiddenPlaces: [] });
    await first;
    expect(service.isRestricted(google('ChIJ_bad'))).toBeTrue();
    expect(service.isRestricted(google('ChIJ_ok'))).toBeFalse();
    expect(service.isRestrictedStop(externalToPlace(google('ChIJ_bad')))).toBeTrue();
    expect(service.isRestrictedStop({ ...externalToPlace(google('x')), external: null })).toBeFalse();
    await service.load(); // already loaded
    http.expectNone(isList);
  });

  it('hides and unhides a place', async () => {
    const hiding = service.restrict(google('ChIJ_new'), 'LK-21');
    const post = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/restricted-places'));
    expect(post.request.body).toEqual(jasmine.objectContaining({ source: 'google', externalId: 'ChIJ_new', district: 'LK-21' }));
    post.flush(entry(7, 'ChIJ_new'));
    await hiding;
    expect(service.isRestricted(google('ChIJ_new'))).toBeTrue();

    const showing = service.unrestrict(service.entryFor(google('ChIJ_new'))!);
    http.expectOne((r) => r.method === 'DELETE' && r.url.endsWith('/restricted-places/7')).flush(null);
    await showing;
    expect(service.isRestricted(google('ChIJ_new'))).toBeFalse();
  });

  it('hides nothing if the list cannot be loaded, and tries again later', async () => {
    const failed = service.load();
    http.expectOne(isList).flush('down', { status: 500, statusText: 'Error' });
    await failed;
    expect(service.list()).toEqual([]);
    void service.load();
    http.expectOne(isList).flush({ places: [], hiddenPlaces: [] });
  });

  it("hides Google's copy of one of our hidden places", async () => {
    const loading = service.load();
    http.expectOne(isList).flush({ places: [], hiddenPlaces: [{ id: 2, name: 'Jaffna Dutch Fort', latitude: 9.662, longitude: 80.008 }] });
    await loading;
    const googleFort = { ...google('ChIJ_fort'), name: 'Dutch Fort - Jaffna', latitude: 9.6611, longitude: 80.0097 };
    expect(service.isRestricted(googleFort)).toBeTrue();
    expect(service.hiddenOurMatch(googleFort)?.id).toBe(2);
    expect(service.isRestricted({ ...google('ChIJ_other'), name: 'Casuarina Beach', latitude: 9.76, longitude: 79.89 })).toBeFalse();
  });
});
