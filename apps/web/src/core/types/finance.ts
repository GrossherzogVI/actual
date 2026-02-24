// SurrealDB record IDs come back as strings like "account:checking"
// or as objects with `tb` and `id` properties

export type Account = {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'credit' | 'cash' | 'investment';
  balance: number;
  currency: string;
  closed: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Payee = {
  id: string;
  name: string;
  transfer_account?: string;
  created_at: string;
};

export type Category = {
  id: string;
  name: string;
  parent?: string;
  color?: string;
  icon?: string;
  sort_order: number;
  is_income: boolean;
  created_at: string;
};

export type Transaction = {
  id: string;
  date: string;
  amount: number;
  account: string;
  payee?: string;
  category?: string;
  notes?: string;
  imported: boolean;
  cleared: boolean;
  reconciled: boolean;
  transfer_id?: string;
  ai_confidence?: number;
  ai_classified: boolean;
  created_at: string;
  updated_at: string;
  // Resolved via record link traversal (payee.name, category.name)
  payee_name?: string;
  category_name?: string;
};

export type Contract = {
  id: string;
  name: string;
  provider: string;
  category?: string;
  type:
    | 'subscription'
    | 'insurance'
    | 'utility'
    | 'loan'
    | 'membership'
    | 'other';
  amount: number;
  interval:
    | 'monthly'
    | 'quarterly'
    | 'semi-annual'
    | 'annual'
    | 'weekly'
    | 'custom';
  start_date?: string;
  end_date?: string;
  notice_period_months?: number;
  auto_renewal: boolean;
  status: string;
  annual_cost: number; // computed
  health: 'green' | 'yellow' | 'red' | 'grey'; // computed
  created_at: string;
  updated_at: string;
};

export type ReviewItem = {
  id: string;
  type: string;
  transaction?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  ai_suggestion?: {
    suggested_category?: string;
    confidence?: number;
    raw_response?: string;
    error?: string;
    contract_id?: string;
    contract_name?: string;
    action?: string;
  };
  status: 'pending' | 'accepted' | 'dismissed' | 'snoozed';
  explanation?: string;
  created_at: string;
  resolved_at?: string;
  // Resolved via record link traversal in enriched queries
  transaction_amount?: number;
  transaction_payee_name?: string;
  transaction_date?: string;
  transaction_notes?: string;
};

export type Schedule = {
  id: string;
  name: string;
  amount: number;
  account: string;
  category?: string;
  payee?: string;
  frequency: 'monthly' | 'weekly' | 'yearly' | 'custom';
  next_date: string;
  active: boolean;
  created_at: string;
};

export type DashboardPulse = {
  total_balance: number;
  pending_reviews: number;
  active_contracts: number;
  upcoming_payments: Contract[];
};

export type ThisMonthSummary = {
  income: number;
  expenses: number;
  net: number;
  transaction_count: number;
};

// -- Analytics --

export type CategorySpending = {
  category_id: string;
  category_name: string;
  parent_id?: string;
  total: number;
  count: number;
  percentage: number;
};

export type MonthSummary = {
  month: string; // "2026-02"
  income: number;
  expenses: number;
  net: number;
};

export type FixedVarDetail = {
  month: string;
  fixed: number; // from contracts
  variable: number; // non-contract spending
};

export type TrendPoint = {
  month: string;
  category_id: string;
  category_name: string;
  total: number;
};

export type MerchantSpending = {
  payee_id: string;
  payee_name: string;
  total: number;
  count: number;
};

export type MonthDelta = {
  category_name: string;
  current: number;
  previous: number;
  delta: number;
  delta_pct: number;
};

// -- Budget --

export type Budget = {
  id: string;
  category: string;
  month: string; // "2026-02"
  amount: number;
  rollover: boolean;
  created_at: string;
  updated_at: string;
};

export type BudgetSummary = {
  total_budgeted: number;
  total_spent: number;
  total_remaining: number;
  envelope_count: number;
};

export type BudgetEnvelopeData = Budget & {
  category_name: string;
  spent: number;
  remaining: number;
  percentage: number;
};

// -- Intelligence --

export type Anomaly = {
  id: string;
  transaction?: string;
  type: 'unusual_amount' | 'new_payee' | 'frequency_change' | 'category_drift';
  severity: 'low' | 'medium' | 'high';
  description: string;
  explanation?: string;
  resolved: boolean;
  created_at: string;
};

export type SpendingPattern = {
  id: string;
  type: 'recurring_untracked' | 'seasonal' | 'increasing' | 'decreasing';
  description: string;
  payee_name?: string;
  amount?: number;
  frequency?: string;
  confidence: number;
  dismissed: boolean;
  created_at: string;
};
