/** A time a place is open on the trip day, in minutes after midnight (end may be 1440 = midnight). */
export interface OpenWindow {
  start: number;
  end: number;
}

/** What we know about a place's hours on one day. */
export type HoursInfo =
  | { kind: 'always' }
  | { kind: 'windows'; windows: OpenWindow[] }
  | { kind: 'closedDay' }
  | { kind: 'unknown' };

export type VisitStatus = 'ok' | 'waits' | 'closesEarly' | 'closedNow' | 'closedDay' | 'unknown';

export interface VisitCheck {
  status: VisitStatus;
  /** Minutes to wait for the place to open (status 'waits', or 'closesEarly' after waiting). */
  wait: number;
  /** Opening / closing time of the window the visit falls in (or the next one). */
  opensAt?: number;
  closesAt?: number;
}

/** One weekly opening period from Google (day 0 = Sunday … 6 = Saturday); close null = open around the clock. */
export interface WeeklyPeriod {
  openDay: number;
  openMinute: number;
  closeDay: number | null;
  closeMinute: number | null;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function toMinutes(hour: number, minute: number, meridiem: string | undefined): number {
  let h = hour % 24;
  if (meridiem === 'pm' && h < 12) h += 12;
  if (meridiem === 'am' && h === 12) h = 0;
  return h * 60 + minute;
}

/**
 * Reads opening hours written in English, as in our place data — e.g. "8:00 AM - 6:00 PM daily",
 * "6:00 AM - 12:00 PM, 4:00 PM - 8:30 PM daily", "Open 24 hours", "9:00 AM - 5:00 PM (closed Tuesdays)".
 * Anything without a clear time range ("Puja at 4:30 AM…", "Open daily") is 'unknown'.
 */
export function parseOpeningHours(text: string | null | undefined, weekday: number): HoursInfo {
  const value = (text ?? '').toLowerCase();
  if (!value.trim()) return { kind: 'unknown' };
  if (/24\s*hours|24\/7|around the clock/.test(value)) return { kind: 'always' };

  // "closed Tuesdays", "closed on Mondays and Fridays"
  const closedPart = /closed (?:on )?([a-z ,&]+)/.exec(value)?.[1] ?? '';
  if (DAYS.some((day, i) => i === weekday && closedPart.includes(day))) return { kind: 'closedDay' };

  const range = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/g;
  const windows: OpenWindow[] = [];
  for (const m of value.matchAll(range)) {
    const [startH, startM, endH, endM] = [Number(m[1]), Number(m[2] ?? 0), Number(m[4]), Number(m[5] ?? 0)];
    let startMer = m[3];
    const endMer = m[6];
    if (!startMer && !endMer && (startH > 24 || endH > 24)) continue;
    if (!startMer && !endMer && !m[2] && !m[5]) continue; // bare numbers like "1 - 2" are not times
    // "6 - 10 PM": the start borrows the end's AM/PM unless that would put it after the end.
    if (!startMer && endMer) startMer = toMinutes(startH, startM, endMer) <= toMinutes(endH, endM, endMer) ? endMer : endMer === 'pm' ? 'am' : 'pm';
    const start = toMinutes(startH, startM, startMer);
    let end = toMinutes(endH, endM, endMer);
    if (end <= start) end += 24 * 60; // closes after midnight
    windows.push({ start, end: Math.min(end, 24 * 60) });
  }
  return windows.length > 0 ? { kind: 'windows', windows: windows.sort((a, b) => a.start - b.start) } : { kind: 'unknown' };
}

/** Google's weekly periods → the windows for one day. */
export function hoursFromWeeklyPeriods(periods: WeeklyPeriod[] | null | undefined, weekday: number): HoursInfo {
  if (!periods) return { kind: 'unknown' };
  if (periods.length === 0) return { kind: 'closedDay' };
  if (periods.some((p) => p.closeDay === null)) return { kind: 'always' };
  const windows = periods
    .filter((p) => p.openDay === weekday)
    .map((p) => ({ start: p.openMinute, end: p.closeDay === weekday && p.closeMinute! > p.openMinute ? p.closeMinute! : 24 * 60 }));
  // A period that started the day before and runs past midnight also counts.
  for (const p of periods) {
    if (p.openDay !== weekday && p.closeDay === weekday && p.closeMinute! > 0) windows.push({ start: 0, end: p.closeMinute! });
  }
  return windows.length > 0 ? { kind: 'windows', windows: windows.sort((a, b) => a.start - b.start) } : { kind: 'closedDay' };
}

/**
 * Checks a visit arriving at `arrive` (minutes after midnight) and lasting `visitMinutes` against the hours.
 * Arriving before opening means waiting; leaving after closing is flagged.
 */
export function checkVisit(info: HoursInfo, arrive: number, visitMinutes: number): VisitCheck {
  switch (info.kind) {
    case 'unknown':
      return { status: 'unknown', wait: 0 };
    case 'always':
      return { status: 'ok', wait: 0 };
    case 'closedDay':
      return { status: 'closedDay', wait: 0 };
  }
  const window = info.windows.find((w) => w.end > arrive);
  if (!window) return { status: 'closedNow', wait: 0, closesAt: info.windows[info.windows.length - 1].end };
  const wait = Math.max(0, window.start - arrive);
  const leave = arrive + wait + visitMinutes;
  if (leave > window.end) return { status: 'closesEarly', wait, opensAt: window.start, closesAt: window.end };
  return { status: wait > 0 ? 'waits' : 'ok', wait, opensAt: window.start, closesAt: window.end };
}

/** Problems worth warning about (waiting is fine). */
export function isHoursProblem(status: VisitStatus): boolean {
  return status === 'closesEarly' || status === 'closedNow' || status === 'closedDay';
}
