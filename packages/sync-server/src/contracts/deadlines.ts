// @ts-strict-ignore
/**
 * Payment deadline computation — duplicated from loot-core/src/shared/deadlines.ts
 * and loot-core/src/shared/german-holidays.ts.
 *
 * sync-server cannot import from loot-core, so the logic lives here verbatim.
 * If you change the shared modules, keep this file in sync.
 */

// ─── German Holiday Computation ──────────────────────────────────────────────

export type Bundesland =
  | 'BW' | 'BY' | 'BE' | 'BB' | 'HB' | 'HH' | 'HE' | 'MV'
  | 'NI' | 'NW' | 'RP' | 'SL' | 'SN' | 'ST' | 'SH' | 'TH';

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addCalendarDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function easterSunday(year: number): Date {
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
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getHolidays(year: number, bundesland?: Bundesland | null): Set<string> {
  const holidays = new Set<string>();
  const easter = easterSunday(year);

  holidays.add(`${year}-01-01`);
  holidays.add(`${year}-05-01`);
  holidays.add(`${year}-10-03`);
  holidays.add(`${year}-12-25`);
  holidays.add(`${year}-12-26`);

  holidays.add(fmtDate(addCalendarDays(easter, -2)));
  holidays.add(fmtDate(addCalendarDays(easter, 1)));
  holidays.add(fmtDate(addCalendarDays(easter, 39)));
  holidays.add(fmtDate(addCalendarDays(easter, 50)));

  if (!bundesland) return holidays;

  if (['BW', 'BY', 'ST'].includes(bundesland)) {
    holidays.add(`${year}-01-06`);
  }
  if (['BE', 'MV'].includes(bundesland)) {
    holidays.add(`${year}-03-08`);
  }
  if (['BW', 'BY', 'HE', 'NW', 'RP', 'SL'].includes(bundesland)) {
    holidays.add(fmtDate(addCalendarDays(easter, 60)));
  }
  if (['SL', 'BY'].includes(bundesland)) {
    holidays.add(`${year}-08-15`);
  }
  if (bundesland === 'TH') {
    holidays.add(`${year}-09-20`);
  }
  if (['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'].includes(bundesland)) {
    holidays.add(`${year}-10-31`);
  }
  if (['BW', 'BY', 'NW', 'RP', 'SL'].includes(bundesland)) {
    holidays.add(`${year}-11-01`);
  }
  if (bundesland === 'SN') {
    const nov23 = new Date(year, 10, 23);
    const dayOfWeek = nov23.getDay();
    const offset = ((dayOfWeek + 4) % 7) || 7;
    holidays.add(fmtDate(addCalendarDays(nov23, -offset)));
  }

  return holidays;
}

// ─── Payment Method Types ─────────────────────────────────────────────────────

export type PaymentMethod =
  | 'lastschrift'
  | 'dauerauftrag'
  | 'manual_sepa'
  | 'international'
  | 'other';

export const METHOD_LEAD_DAYS: Record<PaymentMethod, number> = {
  lastschrift: 0,
  dauerauftrag: 1,
  manual_sepa: 2,
  international: 5,
  other: 2,
};

export type DeadlineShift = 'before' | 'after';

// ─── Business Day Utilities ───────────────────────────────────────────────────

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function isBusinessDay(date: Date, bundesland?: Bundesland | null): boolean {
  if (isWeekend(date)) return false;
  const holidays = getHolidays(date.getFullYear(), bundesland);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return !holidays.has(`${y}-${m}-${day}`);
}

export function nextBusinessDay(
  date: Date,
  direction: DeadlineShift,
  bundesland?: Bundesland | null,
): Date {
  const d = new Date(date);
  const step = direction === 'before' ? -1 : 1;
  while (!isBusinessDay(d, bundesland)) {
    d.setDate(d.getDate() + step);
  }
  return d;
}

export function addBusinessDays(
  date: Date,
  n: number,
  bundesland?: Bundesland | null,
): Date {
  const d = new Date(date);
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (isBusinessDay(d, bundesland)) {
      remaining--;
    }
  }
  return d;
}

// ─── Deadline Computation ─────────────────────────────────────────────────────

export interface DeadlineConfig {
  nominalDate: string;
  paymentMethod: PaymentMethod;
  leadTimeOverride?: number | null;
  gracePeriodDays: number;
  softShift: DeadlineShift;
  hardShift: DeadlineShift;
  bundesland?: Bundesland | null;
}

export interface DeadlineResult {
  action: string;
  soft: string;
  hard: string;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

export function computeDeadlines(config: DeadlineConfig): DeadlineResult {
  const {
    nominalDate,
    paymentMethod,
    leadTimeOverride,
    gracePeriodDays,
    softShift,
    hardShift,
    bundesland,
  } = config;

  const nominal = parseDate(nominalDate);
  const soft = nextBusinessDay(nominal, softShift, bundesland);
  const hardRaw = addBusinessDays(soft, gracePeriodDays, bundesland);
  const hard = nextBusinessDay(hardRaw, hardShift, bundesland);
  const leadTime = leadTimeOverride ?? METHOD_LEAD_DAYS[paymentMethod];
  const actionRaw = addBusinessDays(soft, -leadTime, bundesland);
  const action = nextBusinessDay(actionRaw, 'before', bundesland);

  return {
    action: toISO(action),
    soft: toISO(soft),
    hard: toISO(hard),
  };
}

export function deadlineStatus(
  deadlines: DeadlineResult,
  today?: string,
): 'ok' | 'action_due' | 'soft_passed' | 'hard_passed' {
  const t = today ?? toISO(new Date());
  if (t > deadlines.hard) return 'hard_passed';
  if (t > deadlines.soft) return 'soft_passed';
  if (t >= deadlines.action) return 'action_due';
  return 'ok';
}

// ─── Payment Date Generation ──────────────────────────────────────────────────

const INTERVAL_MONTHS: Record<string, number> = {
  weekly: 0,      // handled specially
  monthly: 1,
  quarterly: 3,
  'semi-annual': 6,
  annual: 12,
};

/**
 * Generate the next N nominal payment dates starting from a base date.
 * Uses the contract's interval and start_date as anchor.
 */
export function nextPaymentDates(
  startDate: string,
  interval: string,
  customIntervalDays: number | null,
  count: number,
): string[] {
  const results: string[] = [];
  const today = toISO(new Date());
  const anchor = parseDate(startDate);

  if (interval === 'weekly') {
    // Find first occurrence on or after today
    const d = new Date(anchor);
    while (toISO(d) < today) {
      d.setDate(d.getDate() + 7);
    }
    for (let i = 0; i < count; i++) {
      results.push(toISO(d));
      d.setDate(d.getDate() + 7);
    }
    return results;
  }

  if (interval === 'custom' && customIntervalDays && customIntervalDays > 0) {
    const d = new Date(anchor);
    while (toISO(d) < today) {
      d.setDate(d.getDate() + customIntervalDays);
    }
    for (let i = 0; i < count; i++) {
      results.push(toISO(d));
      d.setDate(d.getDate() + customIntervalDays);
    }
    return results;
  }

  const months = INTERVAL_MONTHS[interval] ?? 1;

  // Walk forward from anchor until we reach today, then collect next N dates
  let step = 0;
  while (true) {
    const d = new Date(anchor);
    d.setMonth(d.getMonth() + step * months);
    // Clamp day overflow (e.g. Jan 31 + 1 month = Feb 28)
    if (d.getDate() < anchor.getDate()) {
      d.setDate(0); // last day of previous month
    }
    const dateStr = toISO(d);
    if (dateStr >= today) {
      if (results.length === 0) {
        // Also include the one just before today so we can show "current" period
        const prev = new Date(anchor);
        prev.setMonth(prev.getMonth() + (step - 1) * months);
        if (prev.getDate() < anchor.getDate()) prev.setDate(0);
        const prevStr = toISO(prev);
        if (prevStr >= startDate && step > 0) {
          results.push(prevStr);
        }
      }
      results.push(dateStr);
      if (results.length >= count) break;
    }
    step++;
    // Safety: stop after 10 years of steps
    if (step > 520) break;
  }

  return results.slice(0, count);
}
