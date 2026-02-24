/**
 * Canonical German-locale formatting for EUR currency, dates, and relative dates.
 * Import from here instead of creating inline Intl.NumberFormat / toLocaleString calls.
 */

const EUR_FORMATTER = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const EUR_PLAIN_FORMATTER = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DE_DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Format cents as EUR currency string with symbol.
 * Returns "\u2014" (em dash) for null/undefined values.
 *
 * @example formatEur(123456) => "1.234,56\u00a0\u20ac"
 * @example formatEur(null) => "\u2014"
 */
export function formatEur(cents: number | null): string {
  if (cents == null) return '\u2014';
  return EUR_FORMATTER.format(cents / 100);
}

/**
 * Format cents as a plain decimal number (no currency symbol).
 * Returns "-" for null/undefined values.
 *
 * @example formatAmountPlain(123456) => "1.234,56"
 * @example formatAmountPlain(null) => "-"
 */
export function formatAmountPlain(cents: number | null): string {
  if (cents == null) return '-';
  return EUR_PLAIN_FORMATTER.format(cents / 100);
}

/**
 * Format an ISO date string (YYYY-MM-DD) as German date (DD.MM.YYYY).
 *
 * @example formatDateDE("2026-02-24") => "24.02.2026"
 */
export function formatDateDE(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return DE_DATE_FORMATTER.format(new Date(year, month - 1, day));
}

/**
 * Format a date relative to today in German.
 *
 * @example formatRelativeDate("2026-02-24") => "heute"
 * @example formatRelativeDate("2026-02-25") => "morgen"
 * @example formatRelativeDate("2026-02-27") => "in 3 Tagen"
 * @example formatRelativeDate("2026-02-23") => "gestern"
 * @example formatRelativeDate("2026-02-20") => "vor 4 Tagen"
 */
export function formatRelativeDate(date: string): string {
  const target = new Date(date + 'T00:00:00');
  const now = new Date();
  const diffMs =
    Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  if (days === -1) return 'gestern';
  if (days > 1) return `in ${days} Tagen`;
  return `vor ${Math.abs(days)} Tagen`;
}
