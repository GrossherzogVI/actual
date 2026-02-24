/**
 * Unit tests for holidays.ts
 *
 * Covers:
 *  - computeEaster (via observable holiday dates): known Easter dates 2024-2030
 *  - Fixed nationwide holidays (Neujahr, Tag der Arbeit, etc.)
 *  - Moveable holidays derived from Easter (Karfreitag, Ostermontag,
 *    Christi Himmelfahrt, Pfingstmontag, Fronleichnam)
 *  - Buß-und-Bettag computation (Wednesday before Nov 23)
 *  - State-specific holiday inclusion / exclusion
 *  - getGermanHolidays() with and without a Bundesland argument
 *  - getHolidayDateSet() and getHolidayForDate() helper utilities
 *  - Edge-case years (2000, 2100)
 *  - Output sorted by date
 */

import { describe, expect, it } from 'vitest';

import {
  getGermanHolidays,
  getHolidayDateSet,
  getHolidayForDate,
} from '../holidays';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Return the holiday with a given name from a list, or throw. */
function findHoliday(holidays: ReturnType<typeof getGermanHolidays>, name: string) {
  const h = holidays.find(x => x.name === name);
  if (!h) throw new Error(`Holiday "${name}" not found in list`);
  return h;
}

// ── Easter / Computus ─────────────────────────────────────────────────────────
//
// NOTE ON DATE VALUES:
// The source uses local-time Date constructors and local-time getters (getDate,
// getMonth, getFullYear), so all dates are in the system timezone.
// The jsdom test environment runs with TZ=Europe/Berlin (CET/CEST).
// The dates below are what the algorithm actually produces in that environment.
// Reference: computeEaster() + toDateString() in holidays.ts.

describe('Easter computation (Anonymous Gregorian Computus)', () => {
  const cases: Array<[number, string]> = [
    [2024, '2024-03-31'], // March 31
    [2025, '2025-04-20'], // April 20
    [2026, '2026-04-05'], // April 5
    [2027, '2027-03-28'], // March 28
    [2030, '2030-04-21'], // April 21
  ];

  // We observe Easter through Ostersonntag in the national holiday list.
  for (const [year, expected] of cases) {
    it(`Easter ${year} → ${expected}`, () => {
      const holidays = getGermanHolidays(year);
      const ostersonntag = findHoliday(holidays, 'Ostersonntag');
      expect(ostersonntag.date).toBe(expected);
    });
  }
});

// ── Nationwide fixed-date holidays ────────────────────────────────────────────

describe('Fixed nationwide holidays', () => {
  it('Neujahr → January 1', () => {
    const h = findHoliday(getGermanHolidays(2026), 'Neujahr');
    expect(h.date).toBe('2026-01-01');
    expect(h.type).toBe('national');
  });

  it('Tag der Arbeit → May 1', () => {
    const h = findHoliday(getGermanHolidays(2026), 'Tag der Arbeit');
    expect(h.date).toBe('2026-05-01');
    expect(h.type).toBe('national');
  });

  it('Tag der Deutschen Einheit → October 3', () => {
    const h = findHoliday(getGermanHolidays(2026), 'Tag der Deutschen Einheit');
    expect(h.date).toBe('2026-10-03');
    expect(h.type).toBe('national');
  });

  it('1. Weihnachtstag → December 25', () => {
    const h = findHoliday(getGermanHolidays(2026), '1. Weihnachtstag');
    expect(h.date).toBe('2026-12-25');
    expect(h.type).toBe('national');
  });

  it('2. Weihnachtstag → December 26', () => {
    const h = findHoliday(getGermanHolidays(2026), '2. Weihnachtstag');
    expect(h.date).toBe('2026-12-26');
    expect(h.type).toBe('national');
  });

  it('fixed holidays are consistent across different years', () => {
    for (const year of [2024, 2025, 2026, 2027]) {
      const holidays = getGermanHolidays(year);
      expect(findHoliday(holidays, 'Neujahr').date).toBe(`${year}-01-01`);
      expect(findHoliday(holidays, 'Tag der Arbeit').date).toBe(`${year}-05-01`);
      expect(findHoliday(holidays, 'Tag der Deutschen Einheit').date).toBe(`${year}-10-03`);
      expect(findHoliday(holidays, '1. Weihnachtstag').date).toBe(`${year}-12-25`);
      expect(findHoliday(holidays, '2. Weihnachtstag').date).toBe(`${year}-12-26`);
    }
  });
});

// ── Moveable holidays (Easter-relative) ───────────────────────────────────────

describe('Moveable holidays — 2026 (Easter: 2026-04-05 in Europe/Berlin)', () => {
  const year = 2026;

  it('Karfreitag → Easter - 2 days = 2026-04-03', () => {
    const h = findHoliday(getGermanHolidays(year), 'Karfreitag');
    expect(h.date).toBe('2026-04-03');
    expect(h.type).toBe('national');
  });

  it('Ostermontag → Easter + 1 day = 2026-04-06', () => {
    const h = findHoliday(getGermanHolidays(year), 'Ostermontag');
    expect(h.date).toBe('2026-04-06');
    expect(h.type).toBe('national');
  });

  it('Christi Himmelfahrt → Easter + 39 days = 2026-05-14', () => {
    const h = findHoliday(getGermanHolidays(year), 'Christi Himmelfahrt');
    expect(h.date).toBe('2026-05-14');
    expect(h.type).toBe('national');
  });

  it('Pfingstsonntag → Easter + 49 days = 2026-05-24', () => {
    const h = findHoliday(getGermanHolidays(year), 'Pfingstsonntag');
    expect(h.date).toBe('2026-05-24');
    expect(h.type).toBe('national');
  });

  it('Pfingstmontag → Easter + 50 days = 2026-05-25', () => {
    const h = findHoliday(getGermanHolidays(year), 'Pfingstmontag');
    expect(h.date).toBe('2026-05-25');
    expect(h.type).toBe('national');
  });
});

describe('Moveable holidays — 2024 (Easter: 2024-03-31 in Europe/Berlin)', () => {
  const year = 2024;

  it('Karfreitag 2024 → 2024-03-29', () => {
    expect(findHoliday(getGermanHolidays(year), 'Karfreitag').date).toBe('2024-03-29');
  });

  it('Ostermontag 2024 → 2024-04-01', () => {
    expect(findHoliday(getGermanHolidays(year), 'Ostermontag').date).toBe('2024-04-01');
  });

  it('Christi Himmelfahrt 2024 → 2024-05-09', () => {
    expect(findHoliday(getGermanHolidays(year), 'Christi Himmelfahrt').date).toBe('2024-05-09');
  });

  it('Pfingstmontag 2024 → 2024-05-20', () => {
    expect(findHoliday(getGermanHolidays(year), 'Pfingstmontag').date).toBe('2024-05-20');
  });
});

describe('Moveable holidays — 2025 (Easter: 2025-04-20 in Europe/Berlin)', () => {
  const year = 2025;

  it('Karfreitag 2025 → 2025-04-18', () => {
    expect(findHoliday(getGermanHolidays(year), 'Karfreitag').date).toBe('2025-04-18');
  });

  it('Ostermontag 2025 → 2025-04-21', () => {
    expect(findHoliday(getGermanHolidays(year), 'Ostermontag').date).toBe('2025-04-21');
  });

  it('Pfingstmontag 2025 → 2025-06-09', () => {
    expect(findHoliday(getGermanHolidays(year), 'Pfingstmontag').date).toBe('2025-06-09');
  });

  it('Christi Himmelfahrt 2025 → 2025-05-29', () => {
    expect(findHoliday(getGermanHolidays(year), 'Christi Himmelfahrt').date).toBe('2025-05-29');
  });
});

describe('Moveable holidays — 2030 (Easter: 2030-04-21 in Europe/Berlin)', () => {
  const year = 2030;

  it('Ostermontag 2030 → 2030-04-22', () => {
    expect(findHoliday(getGermanHolidays(year), 'Ostermontag').date).toBe('2030-04-22');
  });

  it('Pfingstmontag 2030 → 2030-06-10', () => {
    expect(findHoliday(getGermanHolidays(year), 'Pfingstmontag').date).toBe('2030-06-10');
  });
});

// ── Buß- und Bettag ───────────────────────────────────────────────────────────

describe('Buß- und Bettag (Wednesday before Nov 23)', () => {
  // 2024: Nov 23 is Saturday (dayOfWeek=6) → -3 days → Nov 20 (Wednesday)
  // 2025: Nov 23 is Sunday (dayOfWeek=0) → -4 days → Nov 19 (Wednesday)
  // 2026: Nov 23 is Monday (dayOfWeek=1) → -5 days → Nov 18 (Wednesday)
  // 2027: Nov 23 is Tuesday (dayOfWeek=2) → -6 days → Nov 17 (Wednesday)

  const cases: Array<[number, string]> = [
    [2024, '2024-11-20'],
    [2025, '2025-11-19'],
    [2026, '2026-11-18'],
    [2027, '2027-11-17'],
  ];

  for (const [year, expected] of cases) {
    it(`Buß- und Bettag ${year} → ${expected} (Wednesday)`, () => {
      const holidays = getGermanHolidays(year, 'SN');
      const bub = findHoliday(holidays, 'Buß- und Bettag');
      expect(bub.date).toBe(expected);
      // Verify it is actually a Wednesday
      const d = new Date(bub.date);
      expect(d.getDay()).toBe(3); // 0=Sun … 3=Wed
    });
  }

  it('Buß- und Bettag is never on or after Nov 23', () => {
    for (const year of [2024, 2025, 2026, 2027, 2028, 2029, 2030]) {
      const holidays = getGermanHolidays(year, 'SN');
      const bub = findHoliday(holidays, 'Buß- und Bettag');
      expect(bub.date < `${year}-11-23`).toBe(true);
    }
  });
});

// ── getGermanHolidays — no state arg → national only ─────────────────────────

describe('getGermanHolidays — no state argument', () => {
  it('returns only national holidays', () => {
    const holidays = getGermanHolidays(2026);
    for (const h of holidays) {
      expect(h.type).toBe('national');
    }
  });

  it('returns exactly 11 nationwide holidays', () => {
    // Neujahr, Karfreitag, Ostersonntag, Ostermontag, TagDerArbeit,
    // ChristiHimmelfahrt, Pfingstsonntag, Pfingstmontag,
    // TagDerDeutschenEinheit, 1.Weihnacht, 2.Weihnacht
    const holidays = getGermanHolidays(2026);
    expect(holidays).toHaveLength(11);
  });

  it('does not include any state-specific holiday (e.g. Heilige Drei Könige)', () => {
    const holidays = getGermanHolidays(2026);
    const names = holidays.map(h => h.name);
    expect(names).not.toContain('Heilige Drei Könige');
    expect(names).not.toContain('Fronleichnam');
    expect(names).not.toContain('Buß- und Bettag');
    expect(names).not.toContain('Reformationstag');
  });
});

// ── Bayern (BY) ───────────────────────────────────────────────────────────────

describe('Bayern (BY) holidays', () => {
  const holidays = getGermanHolidays(2026, 'BY');

  it('includes Heilige Drei Könige → January 6', () => {
    const h = findHoliday(holidays, 'Heilige Drei Könige');
    expect(h.date).toBe('2026-01-06');
    expect(h.type).toBe('state');
  });

  it('includes Fronleichnam (Easter + 60 days = 2026-06-04 in Europe/Berlin)', () => {
    const h = findHoliday(holidays, 'Fronleichnam');
    expect(h.date).toBe('2026-06-04');
    expect(h.type).toBe('state');
  });

  it('includes Mariä Himmelfahrt → August 15', () => {
    const h = findHoliday(holidays, 'Mariä Himmelfahrt');
    expect(h.date).toBe('2026-08-15');
    expect(h.type).toBe('state');
  });

  it('includes Allerheiligen → November 1', () => {
    const h = findHoliday(holidays, 'Allerheiligen');
    expect(h.date).toBe('2026-11-01');
    expect(h.type).toBe('state');
  });

  it('does NOT include Buß- und Bettag (Sachsen only)', () => {
    const names = holidays.map(h => h.name);
    expect(names).not.toContain('Buß- und Bettag');
  });

  it('does NOT include Reformationstag (protestant states only)', () => {
    const names = holidays.map(h => h.name);
    expect(names).not.toContain('Reformationstag');
  });

  it('has 15 total holidays (11 national + 4 state)', () => {
    // BY state: Heilige3Könige, Fronleichnam, MariäHimmelfahrt, Allerheiligen
    expect(holidays).toHaveLength(15);
  });

  it('all national holidays are present', () => {
    const names = holidays.map(h => h.name);
    expect(names).toContain('Neujahr');
    expect(names).toContain('Karfreitag');
    expect(names).toContain('Ostermontag');
    expect(names).toContain('Tag der Arbeit');
    expect(names).toContain('Pfingstmontag');
    expect(names).toContain('Tag der Deutschen Einheit');
    expect(names).toContain('1. Weihnachtstag');
  });
});

// ── Sachsen (SN) ──────────────────────────────────────────────────────────────

describe('Sachsen (SN) holidays', () => {
  const holidays = getGermanHolidays(2026, 'SN');

  it('includes Buß- und Bettag', () => {
    const names = holidays.map(h => h.name);
    expect(names).toContain('Buß- und Bettag');
  });

  it('includes Reformationstag → October 31', () => {
    const h = findHoliday(holidays, 'Reformationstag');
    expect(h.date).toBe('2026-10-31');
  });

  it('does NOT include Heilige Drei Könige (BY/BW/ST only)', () => {
    const names = holidays.map(h => h.name);
    expect(names).not.toContain('Heilige Drei Könige');
  });

  it('does NOT include Fronleichnam (catholic states only)', () => {
    const names = holidays.map(h => h.name);
    expect(names).not.toContain('Fronleichnam');
  });

  it('does NOT include Allerheiligen (BW/BY/NW/RP/SL only)', () => {
    const names = holidays.map(h => h.name);
    expect(names).not.toContain('Allerheiligen');
  });

  it('has 13 total holidays (11 national + Reformationstag + Buß-und-Bettag)', () => {
    expect(holidays).toHaveLength(13);
  });
});

// ── NRW (NW) ──────────────────────────────────────────────────────────────────

describe('NRW (NW) holidays', () => {
  const holidays = getGermanHolidays(2026, 'NW');

  it('includes Fronleichnam', () => {
    const names = holidays.map(h => h.name);
    expect(names).toContain('Fronleichnam');
  });

  it('includes Allerheiligen → November 1', () => {
    const h = findHoliday(holidays, 'Allerheiligen');
    expect(h.date).toBe('2026-11-01');
  });

  it('does NOT include Buß- und Bettag (SN only)', () => {
    expect(holidays.map(h => h.name)).not.toContain('Buß- und Bettag');
  });

  it('does NOT include Heilige Drei Könige (BW/BY/ST only)', () => {
    expect(holidays.map(h => h.name)).not.toContain('Heilige Drei Könige');
  });

  it('has 13 total holidays (11 national + Fronleichnam + Allerheiligen)', () => {
    expect(holidays).toHaveLength(13);
  });
});

// ── Brandenburg (BB) ──────────────────────────────────────────────────────────

describe('Brandenburg (BB) holidays', () => {
  const holidays = getGermanHolidays(2026, 'BB');

  it('includes Reformationstag → October 31', () => {
    const h = findHoliday(holidays, 'Reformationstag');
    expect(h.date).toBe('2026-10-31');
  });

  it('does NOT include Fronleichnam', () => {
    expect(holidays.map(h => h.name)).not.toContain('Fronleichnam');
  });

  it('does NOT include Heilige Drei Könige', () => {
    expect(holidays.map(h => h.name)).not.toContain('Heilige Drei Könige');
  });

  it('has 12 total holidays (11 national + Reformationstag)', () => {
    expect(holidays).toHaveLength(12);
  });
});

// ── Berlin (BE) ───────────────────────────────────────────────────────────────

describe('Berlin (BE) holidays', () => {
  const holidays = getGermanHolidays(2026, 'BE');

  it('includes Internationaler Frauentag → March 8', () => {
    const h = findHoliday(holidays, 'Internationaler Frauentag');
    expect(h.date).toBe('2026-03-08');
    expect(h.type).toBe('state');
  });

  it('does NOT include Fronleichnam', () => {
    expect(holidays.map(h => h.name)).not.toContain('Fronleichnam');
  });

  it('has 12 total holidays (11 national + Frauentag)', () => {
    expect(holidays).toHaveLength(12);
  });
});

// ── Baden-Württemberg (BW) ────────────────────────────────────────────────────

describe('Baden-Württemberg (BW) holidays', () => {
  const holidays = getGermanHolidays(2026, 'BW');

  it('includes Heilige Drei Könige', () => {
    expect(holidays.map(h => h.name)).toContain('Heilige Drei Könige');
  });

  it('includes Fronleichnam', () => {
    expect(holidays.map(h => h.name)).toContain('Fronleichnam');
  });

  it('includes Allerheiligen', () => {
    expect(holidays.map(h => h.name)).toContain('Allerheiligen');
  });

  it('does NOT include Mariä Himmelfahrt (BY/SL only)', () => {
    expect(holidays.map(h => h.name)).not.toContain('Mariä Himmelfahrt');
  });

  it('has 14 total holidays (11 national + Heilige3K + Fronleichnam + Allerheiligen)', () => {
    expect(holidays).toHaveLength(14);
  });
});

// ── Buß- und Bettag — only in SN ─────────────────────────────────────────────

describe('Buß- und Bettag exclusive to Sachsen', () => {
  const nonSachsenStates = [
    'BW', 'BY', 'BE', 'BB', 'HB', 'HH',
    'HE', 'MV', 'NI', 'NW', 'RP', 'SL',
    'ST', 'SH', 'TH',
  ] as const;

  for (const state of nonSachsenStates) {
    it(`${state}: does NOT have Buß- und Bettag`, () => {
      const holidays = getGermanHolidays(2026, state);
      const names = holidays.map(h => h.name);
      expect(names).not.toContain('Buß- und Bettag');
    });
  }

  it('SN: HAS Buß- und Bettag', () => {
    const holidays = getGermanHolidays(2026, 'SN');
    expect(holidays.map(h => h.name)).toContain('Buß- und Bettag');
  });
});

// ── All Bundesländer have at least 11 national holidays ─────────────────────

describe('All Bundesländer: minimum 11 national holidays', () => {
  const allStates = [
    'BW', 'BY', 'BE', 'BB', 'HB', 'HH',
    'HE', 'MV', 'NI', 'NW', 'RP', 'SL',
    'SN', 'ST', 'SH', 'TH',
  ] as const;

  for (const state of allStates) {
    it(`${state} 2026: at least 11 holidays`, () => {
      const holidays = getGermanHolidays(2026, state);
      expect(holidays.length).toBeGreaterThanOrEqual(11);
    });
  }

  it('every state includes Neujahr, Tag der Arbeit, and Weihnachtstage', () => {
    const year = 2026;
    for (const state of allStates) {
      const names = getGermanHolidays(year, state).map(h => h.name);
      expect(names).toContain('Neujahr');
      expect(names).toContain('Tag der Arbeit');
      expect(names).toContain('Tag der Deutschen Einheit');
      expect(names).toContain('1. Weihnachtstag');
      expect(names).toContain('2. Weihnachtstag');
    }
  });
});

// ── getHolidayDateSet ─────────────────────────────────────────────────────────

describe('getHolidayDateSet', () => {
  it('returns a Set of YYYY-MM-DD strings', () => {
    const set = getHolidayDateSet(2026);
    expect(set).toBeInstanceOf(Set);
    for (const date of set) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('contains the correct count of national holidays for no-state call', () => {
    const set = getHolidayDateSet(2026);
    expect(set.size).toBe(11);
  });

  it('contains Weihnachtstag dates', () => {
    const set = getHolidayDateSet(2026);
    expect(set.has('2026-12-25')).toBe(true);
    expect(set.has('2026-12-26')).toBe(true);
  });

  it('BY set contains Heilige Drei Könige (2026-01-06)', () => {
    const set = getHolidayDateSet(2026, 'BY');
    expect(set.has('2026-01-06')).toBe(true);
  });

  it('national set does NOT contain Heilige Drei Könige date', () => {
    const set = getHolidayDateSet(2026);
    expect(set.has('2026-01-06')).toBe(false);
  });

  it('SN set contains Buß- und Bettag date', () => {
    const set = getHolidayDateSet(2026, 'SN');
    expect(set.has('2026-11-18')).toBe(true);
  });

  it('no duplicate dates in the set', () => {
    const holidays = getGermanHolidays(2026, 'BY');
    const set = getHolidayDateSet(2026, 'BY');
    // Set deduplicates; if sizes match, no duplicates exist
    expect(set.size).toBe(holidays.length);
  });
});

// ── getHolidayForDate ─────────────────────────────────────────────────────────

describe('getHolidayForDate', () => {
  it('returns the correct holiday for a known date', () => {
    const h = getHolidayForDate('2026-01-01', 2026);
    expect(h).toBeDefined();
    expect(h!.name).toBe('Neujahr');
  });

  it('returns undefined for a non-holiday date', () => {
    const h = getHolidayForDate('2026-01-02', 2026);
    expect(h).toBeUndefined();
  });

  it('returns a state holiday when the state is passed', () => {
    const h = getHolidayForDate('2026-01-06', 2026, 'BY');
    expect(h).toBeDefined();
    expect(h!.name).toBe('Heilige Drei Könige');
  });

  it('returns undefined for state holiday when no state passed', () => {
    // Heilige Drei Könige is state-only; not returned without state arg
    const h = getHolidayForDate('2026-01-06', 2026);
    expect(h).toBeUndefined();
  });

  it('returns state holiday for the correct state', () => {
    const h = getHolidayForDate('2026-11-18', 2026, 'SN'); // Buß-und-Bettag
    expect(h).toBeDefined();
    expect(h!.name).toBe('Buß- und Bettag');
  });

  it('returns undefined for state holiday when wrong state is queried', () => {
    // Buß-und-Bettag is SN-only; should not appear for BY
    const h = getHolidayForDate('2026-11-18', 2026, 'BY');
    expect(h).toBeUndefined();
  });

  it('returns national holiday for any state', () => {
    const h = getHolidayForDate('2026-12-25', 2026, 'HH');
    expect(h).toBeDefined();
    expect(h!.name).toBe('1. Weihnachtstag');
  });
});

// ── Output ordering ───────────────────────────────────────────────────────────
//
// The source appends state holidays after national ones in declaration order.
// National holidays are in chronological order within the national block,
// but the combined list (national + state) is NOT fully sorted by date.

describe('getGermanHolidays — output ordering', () => {
  it('national-only result starts with Neujahr (Jan 1)', () => {
    const holidays = getGermanHolidays(2026);
    expect(holidays[0].name).toBe('Neujahr');
  });

  it('national-only result ends with 2. Weihnachtstag (Dec 26)', () => {
    const holidays = getGermanHolidays(2026);
    expect(holidays[holidays.length - 1].name).toBe('2. Weihnachtstag');
  });

  it('national holidays are in chronological order among themselves', () => {
    const holidays = getGermanHolidays(2026);
    const dates = holidays.map(h => h.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('national holidays appear before state holidays in combined list', () => {
    const holidays = getGermanHolidays(2026, 'BY');
    const firstStateIndex = holidays.findIndex(h => h.type === 'state');
    const lastNationalIndex = holidays.reduce(
      (acc, h, i) => (h.type === 'national' ? i : acc),
      -1,
    );
    // All national entries come before any state entry
    expect(lastNationalIndex).toBeLessThan(firstStateIndex);
  });

  it('getHolidayDateSet result can be used for sorted iteration', () => {
    // The Set contains all holiday dates; sort externally for display
    const set = getHolidayDateSet(2026, 'BY');
    const sorted = [...set].sort();
    expect(sorted[0]).toBe('2026-01-01'); // Neujahr
    expect(sorted[sorted.length - 1]).toBe('2026-12-26'); // 2. Weihnachtstag
  });
});

// ── Edge-case years ───────────────────────────────────────────────────────────

describe('Edge-case years', () => {
  it('year 2000 (century divisible by 400): produces valid Easter', () => {
    const holidays = getGermanHolidays(2000);
    const ostersonntag = findHoliday(holidays, 'Ostersonntag');
    // Easter 2000 = April 23
    expect(ostersonntag.date).toBe('2000-04-23');
  });

  it('year 2000: Neujahr is 2000-01-01', () => {
    const h = findHoliday(getGermanHolidays(2000), 'Neujahr');
    expect(h.date).toBe('2000-01-01');
  });

  it('year 2000: returns exactly 11 national holidays', () => {
    expect(getGermanHolidays(2000)).toHaveLength(11);
  });

  it('year 2100 (century NOT divisible by 400): produces valid Easter', () => {
    const holidays = getGermanHolidays(2100);
    const ostersonntag = findHoliday(holidays, 'Ostersonntag');
    // Easter 2100 = March 28
    expect(ostersonntag.date).toBe('2100-03-28');
  });

  it('year 2100: Neujahr is 2100-01-01', () => {
    const h = findHoliday(getGermanHolidays(2100), 'Neujahr');
    expect(h.date).toBe('2100-01-01');
  });

  it('year 2100: returns exactly 11 national holidays', () => {
    expect(getGermanHolidays(2100)).toHaveLength(11);
  });
});

// ── Holiday type field consistency ────────────────────────────────────────────

describe('Holiday type field', () => {
  it('all returned holidays have type "national" or "state"', () => {
    const holidays = getGermanHolidays(2026, 'BY');
    for (const h of holidays) {
      expect(['national', 'state']).toContain(h.type);
    }
  });

  it('state holidays have a states array that includes the queried state', () => {
    const holidays = getGermanHolidays(2026, 'BY');
    const stateHolidays = holidays.filter(h => h.type === 'state');
    for (const h of stateHolidays) {
      expect(h.states).toBeDefined();
      expect(h.states).toContain('BY');
    }
  });
});
