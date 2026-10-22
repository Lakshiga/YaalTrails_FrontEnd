import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AdminPlacesService } from './admin-places.service';
import { PlaceService } from '../../core/services/place.service';
import { PlaceStore } from '../../core/services/place-store.service';
import { RestrictedPlace, RestrictionService } from '../../core/services/restriction.service';
import { Place } from '../../core/models/place.model';
import { ExternalPlace } from '../../core/models/district.model';

const fort = { id: 7, name: 'Jaffna Dutch Fort', latitude: 9.6621, longitude: 80.0085, isHidden: false } as Place;
const library = { id: 8, name: 'Jaffna Public Library', latitude: 9.6617, longitude: 80.0117, isHidden: false } as Place;
const googleFort = { id: 'g1', source: 'google', name: 'Dutch Fort - Jaffna', latitude: 9.66203, longitude: 80.00842 } as ExternalPlace;

describe('AdminPlacesService', () => {
  let service: AdminPlacesService;
  let api: jasmine.SpyObj<PlaceService>;
  let restrictions: { list: ReturnType<typeof signal<RestrictedPlace[]>>; load: jasmine.Spy; restrict: jasmine.Spy; unrestrict: jasmine.Spy; setHiddenOurs: jasmine.Spy };

  beforeEach(() => {
    api = jasmine.createSpyObj<PlaceService>('PlaceService', ['getAll', 'setVisibility', 'delete']);
    api.setVisibility.and.callFake((id: number, hidden: boolean) => of({ ...[fort, library].find((p) => p.id === id)!, isHidden: hidden }));
    restrictions = {
      list: signal<RestrictedPlace[]>([]),
      load: jasmine.createSpy('load').and.resolveTo(),
      restrict: jasmine.createSpy('restrict').and.resolveTo(),
      unrestrict: jasmine.createSpy('unrestrict').and.resolveTo(),
      setHiddenOurs: jasmine.createSpy('setHiddenOurs')
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: PlaceService, useValue: api },
        { provide: PlaceStore, useValue: { refresh: jasmine.createSpy('refresh') } },
        { provide: RestrictionService, useValue: restrictions }
      ]
    });
    service = TestBed.inject(AdminPlacesService);
  });

  it('hiding a Google place also hides our copy of it, and only that', async () => {
    service.places.set([fort, library]);
    const hidden = await service.hideExternal(googleFort, 'LK-41');
    expect(restrictions.restrict).toHaveBeenCalledWith(googleFort, 'LK-41');
    expect(hidden).toEqual(['Jaffna Dutch Fort']);
    expect(api.setVisibility).toHaveBeenCalledOnceWith(7, true);
    expect(restrictions.setHiddenOurs).toHaveBeenCalledWith([{ id: 7, name: fort.name, latitude: fort.latitude, longitude: fort.longitude }]);
  });

  it('showing a Google place again also shows our hidden copy', async () => {
    service.places.set([{ ...fort, isHidden: true }, library]);
    const entry = { id: 1, source: 'google', externalId: 'g1', name: googleFort.name, latitude: googleFort.latitude, longitude: googleFort.longitude } as RestrictedPlace;
    expect(await service.showExternal(entry)).toEqual(['Jaffna Dutch Fort']);
    expect(api.setVisibility).toHaveBeenCalledOnceWith(7, false);
  });

  it('on load, hides our copies of Google places that were hidden earlier', async () => {
    restrictions.list.set([{ id: 1, source: 'google', externalId: 'g1', name: googleFort.name, latitude: googleFort.latitude, longitude: googleFort.longitude } as RestrictedPlace]);
    api.getAll.and.returnValue(of([fort, library]));
    service.load();
    await new Promise((r) => setTimeout(r));
    expect(api.setVisibility).toHaveBeenCalledOnceWith(7, true);
    expect(service.places().find((p) => p.id === 7)?.isHidden).toBeTrue();
  });
});
