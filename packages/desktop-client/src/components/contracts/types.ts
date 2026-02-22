// Shared types for the contracts module.
// ContractEntity is imported from loot-core for the canonical shape;
// we re-export it here plus add any UI-only helpers.

export type {
  ContractEntity,
  ContractSummary,
} from 'loot-core/server/contracts/app';

export type PriceHistoryItem = {
  id: string;
  contract_id: string;
  old_amount: number; // cents
  new_amount: number; // cents
  change_date: string; // YYYY-MM-DD
  reason: string | null;
  detected_by: 'user' | 'ai' | 'import';
  created_at: string;
};

export type ContractEvent = {
  id: string;
  contract_id: string;
  event_type: string;
  event_date: string;
  amount: number | null;
  notes: string | null;
  created_at: string;
};

export type ContractDocument = {
  id: string;
  contract_id: string;
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
};

// Status and type option tuples used by Select components
export type ContractTypeOption = [string, string];
export type ContractIntervalOption = [string, string];
export type ContractStatusOption = [string, string];

export const CONTRACT_TYPE_OPTIONS: ContractTypeOption[] = [
  ['subscription', 'Subscription'],
  ['insurance', 'Insurance'],
  ['utility', 'Utility'],
  ['loan', 'Loan'],
  ['membership', 'Membership'],
  ['rent', 'Rent'],
  ['tax', 'Tax'],
  ['other', 'Other'],
];

export const CONTRACT_INTERVAL_OPTIONS: ContractIntervalOption[] = [
  ['weekly', 'Weekly'],
  ['monthly', 'Monthly'],
  ['quarterly', 'Quarterly'],
  ['semi-annual', 'Semi-annual'],
  ['annual', 'Annual'],
  ['custom', 'Custom'],
];

export const CONTRACT_STATUS_OPTIONS: ContractStatusOption[] = [
  ['active', 'Active'],
  ['expiring', 'Expiring'],
  ['cancelled', 'Cancelled'],
  ['paused', 'Paused'],
  ['discovered', 'Discovered'],
];

// Color map used by badges across the module
export const CONTRACT_TYPE_COLORS: Record<string, string> = {
  subscription: '#3b82f6',
  insurance: '#6366f1',
  utility: '#10b981',
  loan: '#8b5cf6',
  membership: '#ec4899',
  rent: '#f59e0b',
  tax: '#ef4444',
  other: '#6b7280',
};

export const CONTRACT_STATUS_COLORS: Record<string, string> = {
  active: '#10b981',
  expiring: '#f59e0b',
  cancelled: '#6b7280',
  paused: '#94a3b8',
  discovered: '#3b82f6',
};

export const CONTRACT_HEALTH_COLORS: Record<'green' | 'yellow' | 'red', string> = {
  green: '#10b981',
  yellow: '#f59e0b',
  red: '#ef4444',
};

// Form state used by ContractForm
export type ContractFormData = {
  name: string;
  provider: string;
  type: string;
  amount: string; // display string, converted to cents on save
  interval: string;
  category_id: string;
  start_date: string;
  end_date: string;
  notice_period_months: string;
  auto_renewal: boolean;
  currency: string;
  payment_account_id: string;
  iban: string;
  counterparty: string;
  notes: string;
};

export const EMPTY_CONTRACT_FORM: ContractFormData = {
  name: '',
  provider: '',
  type: '',
  amount: '',
  interval: 'monthly',
  category_id: '',
  start_date: '',
  end_date: '',
  notice_period_months: '',
  auto_renewal: false,
  currency: 'EUR',
  payment_account_id: '',
  iban: '',
  counterparty: '',
  notes: '',
};

// Utility: days until a date (negative = past)
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  // Compare date-only (strip time)
  const diffMs =
    Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) -
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function isDeadlineSoon(dateStr: string | null, thresholdDays = 30): boolean {
  const days = daysUntil(dateStr);
  return days !== null && days >= 0 && days <= thresholdDays;
}

const _EUR_FORMATTER = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmountEur(cents: number | null): string {
  if (cents == null) return '-';
  return _EUR_FORMATTER.format(cents / 100);
}
