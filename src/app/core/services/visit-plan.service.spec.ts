import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { isIsoDate, todayIso, VisitPlanService } from './visit-plan.service';
import { DistrictService } from './district.service';
import { Place } from '../models/place.model';
import { externalToPlace } from '../utils/place-ref';

function place(id: number, district: string): Place {
  return {
    id, name: `Place ${id}`, category: 'Nature', description: '', openingHours: '', travelTips: '', visitDuration: '1 hour',
    latitude: 7.29, longitude: 80.63, imageUrl: '', distanceFromHomeKm: 0, nameTa: '', descriptionTa: '', openingHoursTa: '',
    travelTipsTa: '', averageRating: null, reviewCount: 0, district, isPopular: false
  };
}

describe('trip date helpers', () => {
  it('todayIso formats the local date as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('isIsoDate accepts real dates only', () => {
    expect(isIsoDate('2026-10-18')).toBeTrue();
    expect(isIsoDate('2028-02-29')).toBeTrue();
    expect(isIsoDate('2026-02-30')).toBeFalse();
    expect(isIsoDate('18/10/2026')).toBeFalse();
    expect(isIsoDate('')).toBeFalse();
  });
});

describe('VisitPlanService trip settings', () => {
  let service: VisitPlanService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr())] });
    TestBed.inject(DistrictService).districts.set([
      { code: 'LK-21', name: 'Kandy', nameTa: 'கண்டி', latitude: 7.2906, longitude: 80.6337 },
      { code: 'LK-41', name: 'Jaffna', nameTa: 'யாழ்ப்பாணம்', latitude: 9.6615, longitude: 80.0255 }
    ]);
    service = TestBed.inject(VisitPlanService);
  });

  afterEach(() => localStorage.clear());

  it('defaults to today, starting from Jaffna town', () => {
    expect(service.date()).toBe(todayIso());
    expect(service.startArea()).toBe('home');
    expect(service.startLocation()).toEqual({ latitude: 9.6615, longitude: 80.0255 });
  });

  it('accepts a future date and rejects past or invalid ones', () => {
    service.setDate('2999-12-31');
    expect(service.date()).toBe('2999-12-31');
    service.setDate('2000-01-01');
    expect(service.date()).toBe('2999-12-31');
    service.setDate('not-a-date');
    expect(service.date()).toBe('2999-12-31');
  });

  it('remembers the date of the active plan', () => {
    service.setDate('2999-06-01');
    expect(JSON.parse(localStorage.getItem('yaal_day_plans')!).plans['LK-41'].date).toBe('2999-06-01');
  });

  it('starts a new plan from the district of its first place', () => {
    service.add(place(17, 'LK-21'));
    expect(service.startArea()).toBe('LK-21');
    expect(service.startLocation()).toEqual({ latitude: 7.2906, longitude: 80.6337 });
    expect(service.schedule().stops[0].travelKm).toBeLessThan(5);
  });

  it('starts Jaffna plans from Jaffna town', () => {
    service.add(place(1, 'LK-41'));
    expect(service.startArea()).toBe('home');
  });

  it('holds Google places next to our own and removes or reorders them by key', () => {
    const ours = place(17, 'LK-21');
    const google = externalToPlace({
      id: 'ChIJ_x', source: 'google', name: 'Google spot', nameTa: '', category: 'Nature', kind: 'park',
      latitude: 7.3, longitude: 80.6, notable: false, url: 'https://maps.google.com/?cid=9'
    }, 'LK-21');
    service.add(ours);
    service.add(google);
    service.add(google); // no duplicates
    expect(service.plan().length).toBe(2);
    expect(service.isInPlan(google)).toBeTrue();
    service.moveUp(google);
    expect(service.plan()[0]).toBe(google);
    service.remove(google);
    expect(service.plan()).toEqual([ours]);
  });

  it('keeps Google stops when refreshing our places from the server', () => {
    const google = externalToPlace({
      id: 'ChIJ_y', source: 'google', name: 'Kept', nameTa: '', category: 'Heritage', kind: 'museum',
      latitude: 7.3, longitude: 80.6, notable: false, url: 'u'
    });
    service.add(place(5, 'LK-21'));
    service.add(google);
    service.refreshFrom([]); // place 5 was deleted on the server
    expect(service.plan()).toEqual([google]);
  });

  it('ignores unknown start districts', () => {
    service.setStartArea('LK-99');
    expect(service.startArea()).toBe('home');
  });

  it('keeps a separate plan for each district', () => {
    service.add(place(1, 'LK-41'));
    service.add(place(17, 'LK-21'));
    service.add(place(18, 'LK-21'));
    // Adding switches to that place's plan.
    expect(service.activeDistrict()).toBe('LK-21');
    expect(service.plan().map((p) => p.id)).toEqual([17, 18]);
    expect(service.countFor('LK-41')).toBe(1);
    expect(service.totalCount()).toBe(3);
    expect(service.planDistricts().map((p) => p.code)).toEqual(['LK-21', 'LK-41']);
  });

  it('never mixes districts in one plan', () => {
    service.add(place(1, 'LK-41'));
    service.setActive('LK-41');
    service.add(place(17, 'LK-21')); // a Kandy place goes to the Kandy plan, not the Jaffna one
    expect(service.countFor('LK-41')).toBe(1);
    expect(service.countFor('LK-21')).toBe(1);
    expect(service.isInPlan(place(17, 'LK-21'))).toBeTrue();
  });

  it('switches between plans, each with its own date and start point', () => {
    service.add(place(1, 'LK-41'));
    service.setDate('2999-01-01');
    service.add(place(17, 'LK-21'));
    service.setDate('2999-02-02');
    expect(service.startLocation()).toEqual({ latitude: 7.2906, longitude: 80.6337 });
    service.setActive('LK-41');
    expect(service.date()).toBe('2999-01-01');
    expect(service.startArea()).toBe('home');
    service.setActive('LK-21');
    expect(service.date()).toBe('2999-02-02');
  });

  it('clears only the active plan', () => {
    service.add(place(1, 'LK-41'));
    service.add(place(17, 'LK-21'));
    service.clear();
    expect(service.countFor('LK-21')).toBe(0);
    expect(service.countFor('LK-41')).toBe(1);
  });

  it('splits an old single plan into district plans', () => {
    localStorage.clear();
    localStorage.setItem('jaffna_visit_plan', JSON.stringify([place(1, 'LK-41'), place(17, 'LK-21'), place(2, 'LK-41')]));
    localStorage.setItem('jaffna_visit_plan_settings', JSON.stringify({ startTime: '09:30', returnHome: false, startArea: 'home' }));
    const migrated = TestBed.runInInjectionContext(() => new VisitPlanService());
    expect(migrated.countFor('LK-41')).toBe(2);
    expect(migrated.countFor('LK-21')).toBe(1);
    expect(migrated.activeDistrict()).toBe('LK-41');
    expect(migrated.startTime()).toBe('09:30');
    expect(localStorage.getItem('jaffna_visit_plan')).toBeNull();
  });

  describe('start and end points', () => {
    const hotel = { kind: 'place' as const, label: 'Lake Hotel', latitude: 7.2920, longitude: 80.6390 };
    const station = { kind: 'place' as const, label: 'Kandy Railway Station', latitude: 7.2885, longitude: 80.6320 };

    beforeEach(() => service.add(place(17, 'LK-21')));

    it('starts at the district town and returns there by default', () => {
      expect(service.startPoint().kind).toBe('town');
      expect(service.endPoint()).toEqual(service.startPoint());
      expect(service.schedule().returnLeg).not.toBeNull();
    });

    it('can start somewhere else; "back to the start" follows it', () => {
      service.setStart(hotel);
      expect(service.startLocation()).toEqual({ latitude: 7.2920, longitude: 80.6390 });
      expect(service.endPoint()?.label).toBe('Lake Hotel');
      service.setStart(null);
      expect(service.startPoint().kind).toBe('town');
    });

    it('can end at another point, at the district town, or at the last stop', () => {
      service.setStart(hotel);
      service.setEnd(station);
      expect(service.endPoint()?.label).toBe('Kandy Railway Station');
      service.setEnd('town');
      expect(service.endPoint()?.kind).toBe('town');
      service.setEnd('none');
      expect(service.endPoint()).toBeNull();
      expect(service.schedule().returnLeg).toBeNull();
      expect(service.returnHome()).toBeFalse();
    });

    it('keeps start and end per district plan', () => {
      service.setStart(hotel);
      service.add(place(1, 'LK-41'));
      expect(service.startPoint().kind).toBe('town'); // the Jaffna plan is untouched
      service.setActive('LK-21');
      expect(service.startPoint().label).toBe('Lake Hotel');
    });

    it('reads plans saved with the old "return home" switch', () => {
      localStorage.setItem('yaal_day_plans', JSON.stringify({ active: 'LK-21', plans: { 'LK-21': { places: [place(17, 'LK-21')], returnHome: false } } }));
      const reloaded = TestBed.runInInjectionContext(() => new VisitPlanService());
      expect(reloaded.end()).toBe('none');
      expect(reloaded.start()).toBeNull();
    });
  });

  describe('start time and opening hours', () => {
    const at = (hour: number, minute = 0) => new Date(new Date().setHours(hour, minute, 0, 0));

    it('refuses a start time that has already passed today', () => {
      service.add(place(17, 'LK-21')); // the plan is for today by default
      expect(service.setStartTime('09:00', at(10))).toBeFalse();
      expect(service.setStartTime('10:30', at(10))).toBeTrue();
      expect(service.startTime()).toBe('10:30');
      expect(service.startTimePassed(at(11))).toBeTrue();
    });

    it('allows any start time on a later date', () => {
      service.add(place(17, 'LK-21'));
      service.setDate('2999-03-04');
      expect(service.setStartTime('06:00', at(23))).toBeTrue();
      expect(service.startTimePassed(at(23))).toBeFalse();
    });

    it('waits for a place to open and flags places that close too early', () => {
      service.setDate('2999-03-04');
      const temple = { ...place(30, 'LK-21'), openingHours: '4:00 PM - 8:30 PM daily', visitDuration: '1 hour' };
      const market = { ...place(31, 'LK-21'), openingHours: '6:00 AM - 7:00 AM daily', visitDuration: '1 hour' };
      service.add(temple);
      service.setStartTime('08:00');
      const first = service.schedule().stops[0];
      expect(first.check.status).toBe('waits');
      expect(first.arriveAt).toBe(16 * 60);
      service.add(market);
      expect(service.schedule().stops[1].check.status).toBe('closedNow');
      expect(service.schedule().hoursProblems).toBe(1);
    });
  });
});
