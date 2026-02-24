const GERMAN_MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export function computeRemaining(budgeted: number, spent: number): number {
  return budgeted - spent;
}

export function computePercentage(spent: number, budgeted: number): number {
  if (budgeted <= 0) return spent > 0 ? 100 : 0;
  return Math.round((spent / budgeted) * 100 * 10) / 10;
}

export function getProgressColor(percentage: number): string {
  if (percentage >= 100) return 'var(--fo-danger)';
  if (percentage >= 85) return '#f97316'; // orange
  if (percentage >= 75) return '#eab308'; // amber/yellow
  return 'var(--fo-ok)';
}

export function formatMonth(month: string): string {
  // Expects "2026-02"
  const [yearStr, monthStr] = month.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11 || !yearStr) return month;
  return `${GERMAN_MONTHS[monthIndex]} ${yearStr}`;
}

export function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getAdjacentMonth(month: string, offset: number): string {
  // "2026-02" + offset -> "2026-01" for offset=-1
  const [yearStr, monthStr] = month.split('-');
  let year = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10) - 1; // 0-indexed

  m += offset;

  // Normalize
  while (m < 0) {
    m += 12;
    year -= 1;
  }
  while (m >= 12) {
    m -= 12;
    year += 1;
  }

  return `${year}-${String(m + 1).padStart(2, '0')}`;
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}
