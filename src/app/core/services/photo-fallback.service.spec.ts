import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PhotoFallbackService, PhotoRequest } from './photo-fallback.service';

const photo = { url: 'https://upload.wikimedia.org/x.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg', author: 'A. Author', license: 'CC BY-SA 4.0' };

function places(count: number): PhotoRequest[] {
  return Array.from({ length: count }, (_, i) => ({ key: `p:${i + 1}`, name: `Place ${i + 1}`, latitude: 9.66, longitude: 80.02 }));
}

describe('PhotoFallbackService', () => {
  let service: PhotoFallbackService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('yaal_photo_cache');
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(PhotoFallbackService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem('yaal_photo_cache');
  });

  it('looks places up in small batches and stores the photos found', () => {
    service.request(places(6));
    const batches = http.match((r) => r.url.endsWith('/photos/lookup'));
    expect(batches.map((b) => b.request.body.length)).toEqual([4, 2]);
    expect(batches[0].request.body[0]).toEqual({ id: 'p:1', name: 'Place 1', latitude: 9.66, longitude: 80.02 });

    batches[0].flush([{ id: 'p:3', photo }]);
    batches[1].flush([]);
    expect(service.photoFor('p:3')).toEqual(photo);
    expect(service.photoFor('p:1')).toBeNull();
  });

  it('never asks about the same place twice', () => {
    service.request(places(2));
    http.expectOne((r) => r.url.endsWith('/photos/lookup')).flush([]);
    service.request(places(3));
    const second = http.expectOne((r) => r.url.endsWith('/photos/lookup'));
    expect(second.request.body.map((i: { id: string }) => i.id)).toEqual(['p:3']);
    second.flush([]);
  });

  it('tries again later when a lookup fails', () => {
    service.request(places(1));
    http.expectOne((r) => r.url.endsWith('/photos/lookup')).flush('down', { status: 500, statusText: 'Error' });
    service.request(places(1));
    http.expectOne((r) => r.url.endsWith('/photos/lookup')).flush([{ id: 'p:1', photo }]);
    expect(service.photoFor('p:1')).toEqual(photo);
  });

  it('skips places without valid coordinates', () => {
    service.request([{ key: 'p:9', name: 'Nowhere', latitude: 0, longitude: 0 }]);
    http.expectNone((r) => r.url.endsWith('/photos/lookup'));
  });

  it('marks places as pending until their batch answers', () => {
    service.request(places(2));
    expect(service.isPending('p:1')).toBeTrue();
    http.expectOne((r) => r.url.endsWith('/photos/lookup')).flush([{ id: 'p:1', photo }]);
    expect(service.isPending('p:1')).toBeFalse();
    expect(service.isPending('p:2')).toBeFalse();
  });

  it('remembers results in the browser, so the next visit needs no lookup', () => {
    service.request(places(2));
    http.expectOne((r) => r.url.endsWith('/photos/lookup')).flush([{ id: 'p:1', photo }]);

    const nextVisit = TestBed.runInInjectionContext(() => new PhotoFallbackService());
    expect(nextVisit.photoFor('p:1')).toEqual(photo);
    nextVisit.request(places(2)); // p:1 found and p:2 "no photo" are both remembered
    http.expectNone((r) => r.url.endsWith('/photos/lookup'));
  });
});
