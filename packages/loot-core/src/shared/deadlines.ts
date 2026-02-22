// @ts-strict-ignore
/**
 * Payment deadline computation with German business day awareness.
 *
 * Three-tier model:
 *   action = soft - leadTime  (when to initiate payment)
 *   soft   = nominalDate adjusted to business day  (ideal due date)
 *   hard   = soft + gracePeriod  (last day before consequences)
 */

import { type Bundesland, getHolidays } from './german-holidays';

// ─── Payment method lead time defaults (business days) ───────────────────────

export type PaymentMethod =
  | 'lastschrift'    // direct debit — 0 days
  | 'dauerauftrag'   // standing order — 1 day
  | 'manual_sepa'    // manual SEPA transfer — 2 days
  | 'international'  // international wire — 5 days
  | 'other';         // fallback — 2 days

export const METHOD_LEAD_DAYS: Record<PaymentMethod, number> = {
  lastschrift: 0,
  dauerauftrag: 1,
  manual_sepa: 2,
  international: 5,
  other: 2,
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  lastschrift: 'Lastschrift',
  dauerauftrag: 'Dauerauftrag',
  manual_sepa: 'Überweisung (SEPA)',
  international: 'Auslandsüberweisung',
  other: 'Sonstige',
};

export type DeadlineShift = 'before' | 'after';

// ─── Business day utilities ──────────────────────────────────────────────────

const holidayCache = new Map<string, Set<string>>();

function getCachedHolidays(year: number, bundesland?: Bundesland | null): Set<string> {
  const key = `${year}-${bundesland || 'ALL'}`;
  if (!holidayCache.has(key)) {
    holidayCache.set(key, getHolidays(year, bundesland));
  }
  return holidayCache.get(key)!;
}

/** Check if a date is a weekend (Saturday or Sunday). */
function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if a date is a business day (not weekend, not holiday).
 */
export function isBusinessDay(date: Date, bundesland?: Bundesland | null): boolean {
  if (isWeekend(date)) return false;
  const holidays = getCachedHolidays(date.getFullYear(), bundesland);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return !holidays.has(`${y}-${m}-${day}`);
}

/**
 * Move a date to the nearest business day in the given direction.
 *
 * 'before' = move earlier (e.g., Friday before a weekend)
 * 'after'  = move later (e.g., Monday after a weekend)
 *
 * If the date is already a business day, returns it unchanged.
 */
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

/**
 * Add N business days to a date. Negative N subtracts.
 * The start date does NOT count as one of the N days.
 */
export function addBusinessDays(
  date: Date,
  n: number,
  bundesland?: Bundesland | null,
): Date {
  const d = new Date(date);
  if (n === 0) {
    return isBusinessDay(d, bundesland) ? d : nextBusinessDay(d, 'after', bundesland);
  }
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setDate(d.getDate() + step);
    if (isBusinessDay(d, bundesland)) {
      remaining--;
    }
  }
  return d;
}

// ─── Deadline computation ────────────────────────────────────────────────────

export interface DeadlineConfig {
  /** The nominal payment date (YYYY-MM-DD). */
  nominalDate: string;
  /** Payment method for lead time lookup. */
  paymentMethod: PaymentMethod;
  /** Override default lead time (business days). */
  leadTimeOverride?: number | null;
  /** Business days from soft to hard deadline. */
  gracePeriodDays: number;
  /** Direction to shift soft deadline on non-business day. */
  softShift: DeadlineShift;
  /** Direction to shift hard deadline on non-business day. */
  hardShift: DeadlineShift;
  /** Bundesland for holiday awareness. */
  bundesland?: Bundesland | null;
}

export interface DeadlineResult {
  /** When to initiate the payment. */
  action: string;
  /** Ideal due date. */
  soft: string;
  /** Last day before consequences. */
  hard: string;
}

/** Format Date as YYYY-MM-DD. */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD to a local Date. */
function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00');
}

/**
 * Compute the three deadline dates for a single payment occurrence.
 */
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

  // 1. Soft deadline: nominal adjusted to nearest business day
  const soft = nextBusinessDay(nominal, softShift, bundesland);

  // 2. Hard deadline: soft + grace period, then shifted
  const hardRaw = addBusinessDays(soft, gracePeriodDays, bundesland);
  const hard = nextBusinessDay(hardRaw, hardShift, bundesland);

  // 3. Action deadline: soft - lead time, always shifted 'before'
  const leadTime = leadTimeOverride ?? METHOD_LEAD_DAYS[paymentMethod];
  const actionRaw = addBusinessDays(soft, -leadTime, bundesland);
  const action = nextBusinessDay(actionRaw, 'before', bundesland);

  return {
    action: toISO(action),
    soft: toISO(soft),
    hard: toISO(hard),
  };
}

/**
 * Determine the deadline status for a payment based on today's date.
 */
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
