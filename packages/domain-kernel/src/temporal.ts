const FIXED_GERMAN_HOLIDAYS = [
  '01-01',
  '05-01',
  '10-03',
  '12-25',
  '12-26',
] as const;

type Bundesland =
  | 'BW'
  | 'BY'
  | 'BE'
  | 'BB'
  | 'HB'
  | 'HH'
  | 'HE'
  | 'MV'
  | 'NI'
  | 'NW'
  | 'RP'
  | 'SL'
  | 'SN'
  | 'ST'
  | 'SH'
  | 'TH';

const REFORMATION_STATES: Bundesland[] = [
  'BB',
  'MV',
  'SN',
  'ST',
  'TH',
  'HH',
  'HB',
  'SH',
  'NI',
];
const ALL_SAINTS_STATES: Bundesland[] = ['BW', 'BY', 'NW', 'RP', 'SL'];

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export function buildGermanHolidaySet(
  year: number,
  bundesland?: Bundesland,
): Set<string> {
  const holidays = new Set<string>();

  for (const fixedHoliday of FIXED_GERMAN_HOLIDAYS) {
    holidays.add(`${year}-${fixedHoliday}`);
  }

  const easter = easterSunday(year);
  holidays.add(toKey(addDays(easter, -2))); // Good Friday
  holidays.add(toKey(addDays(easter, 1))); // Easter Monday
  holidays.add(toKey(addDays(easter, 39))); // Ascension
  holidays.add(toKey(addDays(easter, 50))); // Whit Monday

  if (bundesland && ALL_SAINTS_STATES.includes(bundesland)) {
    holidays.add(`${year}-11-01`);
  }

  if (bundesland && REFORMATION_STATES.includes(bundesland)) {
    holidays.add(`${year}-10-31`);
  }

  return holidays;
}

export function isWeekend(date: Date): boolean {
  return date.getDay() === 0 || date.getDay() === 6;
}

export function isBusinessDay(date: Date, holidays?: Set<string>): boolean {
  if (isWeekend(date)) return false;
  if (!holidays) return true;
  return !holidays.has(toKey(date));
}

export function shiftToBusinessDay(
  date: Date,
  direction: 'before' | 'after',
  holidays?: Set<string>,
): Date {
  const step = direction === 'before' ? -1 : 1;
  let cursor = new Date(date);
  while (!isBusinessDay(cursor, holidays)) {
    cursor = addDays(cursor, step);
  }
  return cursor;
}

export function computePaymentDeadline(input: {
  dueDate: Date;
  gracePeriodDays?: number;
  hardShift?: 'before' | 'after';
  leadTimeDays?: number;
  holidays?: Set<string>;
}): { softDeadline: Date; hardDeadline: Date } {
  const grace = input.gracePeriodDays ?? 5;
  const lead = input.leadTimeDays ?? 0;
  const hardShift = input.hardShift ?? 'after';

  const softBase = addDays(input.dueDate, -lead);
  const hardBase = addDays(input.dueDate, grace);

  return {
    softDeadline: shiftToBusinessDay(softBase, 'before', input.holidays),
    hardDeadline: shiftToBusinessDay(hardBase, hardShift, input.holidays),
  };
}
