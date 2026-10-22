import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PlaceStore } from './place-store.service';
import { Place } from '../models/place.model';

const place = (id: number, name = `Place ${id}`) => ({ id, name }) as Place;
const isList = (r: { url: string; method: string }) => r.method === 'GET' && r.url.endsWith('/places');

describe('PlaceStore', () => {
  let store: PlaceStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    store = TestBed.inject(PlaceStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads the places once, however many pages ask', () => {
    store.load();
    store.load(); // a second page while the first request is still running
    http.expectOne(isList).flush([place(1), place(2)]);
    store.load(); // a later page: already loaded
    http.expectNone(isList);
    expect(store.places().length).toBe(2);
    expect(store.status()).toBe('ready');
  });

  it('loads again on refresh (after an admin change)', () => {
    store.load();
    http.expectOne(isList).flush([place(1)]);
    store.refresh();
    http.expectOne(isList).flush([place(1), place(3)]);
    expect(store.byId(3)?.name).toBe('Place 3');
  });

  it('keeps the places it has when a refresh fails', () => {
    store.load();
    http.expectOne(isList).flush([place(1)]);
    store.refresh();
    http.expectOne(isList).flush('down', { status: 500, statusText: 'Error' });
    expect(store.places().length).toBe(1);
    expect(store.failed()).toBeFalse();
  });

  it('reports a failed first load so pages can offer a retry', () => {
    store.load();
    http.expectOne(isList).flush('down', { status: 500, statusText: 'Error' });
    expect(store.failed()).toBeTrue();
  });

  it('whenReady waits for the running request instead of starting another', async () => {
    const ready = store.whenReady();
    const again = store.whenReady();
    http.expectOne(isList).flush([place(5)]);
    expect((await ready).map((p) => p.id)).toEqual([5]);
    expect((await again).map((p) => p.id)).toEqual([5]);
    expect((await store.whenReady()).length).toBe(1); // already loaded: no request
  });

  it('updates one place in place', () => {
    store.load();
    http.expectOne(isList).flush([place(1), place(2)]);
    store.update({ ...place(2), name: 'Renamed' });
    expect(store.byId(2)?.name).toBe('Renamed');
    expect(store.byId(1)?.name).toBe('Place 1');
  });
});
