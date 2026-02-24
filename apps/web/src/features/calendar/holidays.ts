/**
 * German public holiday calculation.
 *
 * Supports all 16 federal states (Bundesländer).
 * Easter calculation: Anonymous Gregorian algorithm (Computus).
 */

export type GermanState =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH'
  | 'HE' | 'MV' | 'NI' | 'NW' | 'RP' | 'SL'
  | 'SN' | 'ST' | 'SH' | 'TH';

export type Holiday = {
  date: string;        // YYYY-MM-DD
  name: string;        // German name
  type: 'national' | 'state';
  states?: GermanState[]; // undefined = applies to all states
};

// ── Easter calculation (Anonymous Gregorian Computus) ─────────────────────

/**
 * Returns Easter Sunday date for the given year.
 */
function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-indexed
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fixedDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ── Buß- und Bettag: Wednesday before November 23 ─────────────────────────

function bussUndBettag(year: number): string {
  // Find the Wednesday before Nov 23
  const nov23 = new Date(year, 10, 23); // month is 0-indexed
  // getDay(): 0=Sun, 1=Mon, ..., 3=Wed, ...
  const dayOfWeek = nov23.getDay();
  // Days to subtract to reach previous Wednesday
  // If Nov 23 itself is Wednesday (3), go back 7 days
  const daysBack = dayOfWeek === 3 ? 7 : (dayOfWeek + 4) % 7;
  return toDateString(addDays(nov23, -daysBack));
}

// ── Main holiday generator ─────────────────────────────────────────────────

/**
 * Returns all German public holidays for the given year.
 * If a state is provided, returns national + state-specific holidays.
 * If no state, returns national holidays only.
 */
export function getGermanHolidays(year: number, state?: GermanState): Holiday[] {
  const easter = computeEaster(year);

  const holidays: Holiday[] = [
    // ── National holidays (all 16 states) ──────────────────────────────
    {
      date: fixedDate(year, 1, 1),
      name: 'Neujahr',
      type: 'national',
    },
    {
      date: toDateString(addDays(easter, -2)),
      name: 'Karfreitag',
      type: 'national',
    },
    {
      date: toDateString(easter),
      name: 'Ostersonntag',
      type: 'national',
    },
    {
      date: toDateString(addDays(easter, 1)),
      name: 'Ostermontag',
      type: 'national',
    },
    {
      date: fixedDate(year, 5, 1),
      name: 'Tag der Arbeit',
      type: 'national',
    },
    {
      date: toDateString(addDays(easter, 39)),
      name: 'Christi Himmelfahrt',
      type: 'national',
    },
    {
      date: toDateString(addDays(easter, 49)),
      name: 'Pfingstsonntag',
      type: 'national',
    },
    {
      date: toDateString(addDays(easter, 50)),
      name: 'Pfingstmontag',
      type: 'national',
    },
    {
      date: fixedDate(year, 10, 3),
      name: 'Tag der Deutschen Einheit',
      type: 'national',
    },
    {
      date: fixedDate(year, 12, 25),
      name: '1. Weihnachtstag',
      type: 'national',
    },
    {
      date: fixedDate(year, 12, 26),
      name: '2. Weihnachtstag',
      type: 'national',
    },

    // ── State-specific holidays ─────────────────────────────────────────

    // Heilige Drei Könige — 6.1 (BW, BY, ST)
    {
      date: fixedDate(year, 1, 6),
      name: 'Heilige Drei Könige',
      type: 'state',
      states: ['BW', 'BY', 'ST'],
    },

    // Internationaler Frauentag — 8.3 (BE, MV)
    {
      date: fixedDate(year, 3, 8),
      name: 'Internationaler Frauentag',
      type: 'state',
      states: ['BE', 'MV'],
    },

    // Fronleichnam — Corpus Christi, Easter +60 (BW, BY, HE, NW, RP, SL + parts of SN/TH)
    {
      date: toDateString(addDays(easter, 60)),
      name: 'Fronleichnam',
      type: 'state',
      states: ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'],
    },

    // Mariä Himmelfahrt — 15.8 (BY, SL)
    {
      date: fixedDate(year, 8, 15),
      name: 'Mariä Himmelfahrt',
      type: 'state',
      states: ['BY', 'SL'],
    },

    // Weltkindertag — 20.9 (TH)
    {
      date: fixedDate(year, 9, 20),
      name: 'Weltkindertag',
      type: 'state',
      states: ['TH'],
    },

    // Reformationstag — 31.10 (BB, HB, HH, MV, NI, SN, ST, SH, TH)
    {
      date: fixedDate(year, 10, 31),
      name: 'Reformationstag',
      type: 'state',
      states: ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'],
    },

    // Allerheiligen — 1.11 (BW, BY, NW, RP, SL)
    {
      date: fixedDate(year, 11, 1),
      name: 'Allerheiligen',
      type: 'state',
      states: ['BW', 'BY', 'NW', 'RP', 'SL'],
    },

    // Buß- und Bettag — Wednesday before Nov 23 (SN only)
    {
      date: bussUndBettag(year),
      name: 'Buß- und Bettag',
      type: 'state',
      states: ['SN'],
    },
  ];

  if (!state) {
    return holidays.filter(h => h.type === 'national');
  }

  return holidays.filter(
    h => h.type === 'national' || h.states?.includes(state),
  );
}

/**
 * Returns a Set of holiday date strings (YYYY-MM-DD) for fast lookup.
 */
export function getHolidayDateSet(year: number, state?: GermanState): Set<string> {
  return new Set(getGermanHolidays(year, state).map(h => h.date));
}

/**
 * Returns the holiday on a given date, or undefined if none.
 */
export function getHolidayForDate(
  date: string,
  year: number,
  state?: GermanState,
): Holiday | undefined {
  return getGermanHolidays(year, state).find(h => h.date === date);
}
