import { checkVisit, hoursFromWeeklyPeriods, parseOpeningHours } from './opening-hours';

const TUESDAY = 2;
const h = (hour: number, minute = 0) => hour * 60 + minute;

describe('opening hours', () => {
  describe('parseOpeningHours (our place data)', () => {
    it('reads one or more time ranges', () => {
      expect(parseOpeningHours('8:00 AM - 6:00 PM daily', TUESDAY)).toEqual({ kind: 'windows', windows: [{ start: h(8), end: h(18) }] });
      expect(parseOpeningHours('6:00 AM - 12:00 PM, 4:00 PM - 8:30 PM daily', TUESDAY)).toEqual({
        kind: 'windows',
        windows: [{ start: h(6), end: h(12) }, { start: h(16), end: h(20, 30) }]
      });
      expect(parseOpeningHours('5:30 AM - 8:00 PM daily (puja at 5:30 AM, 9:30 AM and 6:30 PM)', TUESDAY)).toEqual({
        kind: 'windows',
        windows: [{ start: h(5, 30), end: h(20) }]
      });
    });

    it('understands 24-hour places and closing days', () => {
      expect(parseOpeningHours('Open 24 hours', TUESDAY)).toEqual({ kind: 'always' });
      expect(parseOpeningHours('9:00 AM - 5:00 PM (closed Tuesdays)', TUESDAY)).toEqual({ kind: 'closedDay' });
      expect(parseOpeningHours('9:00 AM - 5:00 PM (closed Tuesdays)', 3).kind).toBe('windows');
    });

    it('leaves hours it cannot read as unknown', () => {
      expect(parseOpeningHours('Puja at 4:30 AM, 10:30 AM and 6:30 PM', TUESDAY)).toEqual({ kind: 'unknown' });
      expect(parseOpeningHours('Open daily', TUESDAY)).toEqual({ kind: 'unknown' });
      expect(parseOpeningHours('Pilgrim season December - May', TUESDAY)).toEqual({ kind: 'unknown' });
      expect(parseOpeningHours('', TUESDAY)).toEqual({ kind: 'unknown' });
    });

    it('handles a missing AM/PM on the opening time, and 12 PM / 12 AM', () => {
      expect(parseOpeningHours('6 - 10 PM', TUESDAY)).toEqual({ kind: 'windows', windows: [{ start: h(18), end: h(22) }] });
      expect(parseOpeningHours('10:00 AM - 12:00 AM', TUESDAY)).toEqual({ kind: 'windows', windows: [{ start: h(10), end: h(24) }] });
    });
  });

  describe('hoursFromWeeklyPeriods (Google)', () => {
    it('picks the trip day, treats missing days as closed and no closing time as always open', () => {
      const weekdays = [1, 2, 3, 4, 5].map((day) => ({ openDay: day, openMinute: h(9), closeDay: day, closeMinute: h(17) }));
      expect(hoursFromWeeklyPeriods(weekdays, TUESDAY)).toEqual({ kind: 'windows', windows: [{ start: h(9), end: h(17) }] });
      expect(hoursFromWeeklyPeriods(weekdays, 0)).toEqual({ kind: 'closedDay' });
      expect(hoursFromWeeklyPeriods([{ openDay: 0, openMinute: 0, closeDay: null, closeMinute: null }], TUESDAY)).toEqual({ kind: 'always' });
      expect(hoursFromWeeklyPeriods(null, TUESDAY)).toEqual({ kind: 'unknown' });
    });
  });

  describe('checkVisit', () => {
    const temple = parseOpeningHours('6:00 AM - 12:00 PM, 4:00 PM - 8:30 PM daily', TUESDAY);

    it('is fine when the visit fits', () => {
      expect(checkVisit(temple, h(9), 60).status).toBe('ok');
    });

    it('waits when arriving before opening', () => {
      expect(checkVisit(temple, h(13), 60)).toEqual({ status: 'waits', wait: h(16) - h(13), opensAt: h(16), closesAt: h(20, 30) });
    });

    it('flags a visit that runs past closing', () => {
      expect(checkVisit(temple, h(11, 30), 60).status).toBe('closesEarly');
    });

    it('flags arriving after the last closing and closed days', () => {
      expect(checkVisit(temple, h(21), 30).status).toBe('closedNow');
      expect(checkVisit({ kind: 'closedDay' }, h(10), 30).status).toBe('closedDay');
      expect(checkVisit({ kind: 'unknown' }, h(10), 30).status).toBe('unknown');
    });
  });
});
