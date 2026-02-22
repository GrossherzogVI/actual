// @ts-strict-ignore
/**
 * German public holiday computation.
 *
 * Supports all 16 Bundesländer + federal-only mode.
 * Easter-based movable feasts computed via the Gauss/Anonymous algorithm.
 */

export type Bundesland =
  | 'BW' // Baden-Württemberg
  | 'BY' // Bayern
  | 'BE' // Berlin
  | 'BB' // Brandenburg
  | 'HB' // Bremen
  | 'HH' // Hamburg
  | 'HE' // Hessen
  | 'MV' // Mecklenburg-Vorpommern
  | 'NI' // Niedersachsen
  | 'NW' // Nordrhein-Westfalen
  | 'RP' // Rheinland-Pfalz
  | 'SL' // Saarland
  | 'SN' // Sachsen
  | 'ST' // Sachsen-Anhalt
  | 'SH' // Schleswig-Holstein
  | 'TH'; // Thüringen

export const BUNDESLAND_LABELS: Record<Bundesland, string> = {
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

/** Format a Date as YYYY-MM-DD. */
function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Add days to a date (returns new Date). */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 * https://en.wikipedia.org/wiki/Date_of_Easter#Anonymous_Gregorian_algorithm
 */
export function easterSunday(year: number): Date {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Get all public holidays for a year.
 *
 * @param year - Calendar year
 * @param bundesland - Optional Bundesland code. If null/undefined, returns federal holidays only.
 * @returns Set of YYYY-MM-DD date strings
 */
export function getHolidays(year: number, bundesland?: Bundesland | null): Set<string> {
  const holidays = new Set<string>();
  const easter = easterSunday(year);

  // ── Fixed federal holidays ──────────────────────────────────────────────
  holidays.add(`${year}-01-01`); // Neujahr
  holidays.add(`${year}-05-01`); // Tag der Arbeit
  holidays.add(`${year}-10-03`); // Tag der Deutschen Einheit
  holidays.add(`${year}-12-25`); // 1. Weihnachtstag
  holidays.add(`${year}-12-26`); // 2. Weihnachtstag

  // ── Easter-based federal holidays ───────────────────────────────────────
  holidays.add(fmt(addDays(easter, -2)));  // Karfreitag
  holidays.add(fmt(addDays(easter, 1)));   // Ostermontag
  holidays.add(fmt(addDays(easter, 39)));  // Christi Himmelfahrt
  holidays.add(fmt(addDays(easter, 50)));  // Pfingstmontag

  if (!bundesland) return holidays;

  // ── Per-Bundesland holidays ─────────────────────────────────────────────

  // Heilige Drei Könige (Jan 6): BW, BY, ST
  if (['BW', 'BY', 'ST'].includes(bundesland)) {
    holidays.add(`${year}-01-06`);
  }

  // Internationaler Frauentag (Mar 8): BE, MV
  if (['BE', 'MV'].includes(bundesland)) {
    holidays.add(`${year}-03-08`);
  }

  // Fronleichnam (Easter + 60): BW, BY, HE, NW, RP, SL
  if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(bundesland)) {
    holidays.add(fmt(addDays(easter, 60)));
  }

  // Maria Himmelfahrt (Aug 15): SL, BY (only in communities with Catholic majority)
  // We include it for both SL and BY as a simplification
  if (['SL', 'BY'].includes(bundesland)) {
    holidays.add(`${year}-08-15`);
  }

  // Weltkindertag (Sep 20): TH
  if (bundesland === 'TH') {
    holidays.add(`${year}-09-20`);
  }

  // Reformationstag (Oct 31): BB, HB, HH, MV, NI, SN, ST, SH, TH
  if (['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'].includes(bundesland)) {
    holidays.add(`${year}-10-31`);
  }

  // Allerheiligen (Nov 1): BW, BY, NW, RP, SL
  if (['BW', 'BY', 'NW', 'RP', 'SL'].includes(bundesland)) {
    holidays.add(`${year}-11-01`);
  }

  // Buß- und Bettag (Wednesday before Nov 23): SN
  if (bundesland === 'SN') {
    const nov23 = new Date(year, 10, 23); // Nov 23
    const dayOfWeek = nov23.getDay(); // 0=Sun..6=Sat
    // Wednesday before Nov 23: subtract (dayOfWeek + 4) % 7 days
    const offset = ((dayOfWeek + 4) % 7) || 7;
    holidays.add(fmt(addDays(nov23, -offset)));
  }

  return holidays;
}

/**
 * Check if a given date is a German public holiday.
 */
export function isHoliday(date: Date, bundesland?: Bundesland | null): boolean {
  return getHolidays(date.getFullYear(), bundesland).has(fmt(date));
}
