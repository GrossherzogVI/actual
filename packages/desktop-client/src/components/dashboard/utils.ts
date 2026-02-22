/**
 * Format cents as EUR currency string (German locale).
 * Returns '—' for null values.
 */
export function formatEur(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}
