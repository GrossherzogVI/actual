export type ClassificationResult = {
  transactionId: string;
  categoryId: string;
  confidence: number;
  reasoning: string;
  ruleSuggestion?: {
    payeePattern: string;
    matchField: 'payee' | 'imported_payee' | 'notes';
    matchOp: 'is' | 'contains';
  };
};

export type ClassificationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'auto_applied';

export type AIClassificationEntity = {
  id: string;
  file_id: string;
  transaction_id: string;
  proposed_category: string;
  confidence: number;
  reasoning: string | null;
  status: ClassificationStatus;
  created_at: string;
  resolved_at: string | null;
};

export type AIRuleSuggestionEntity = {
  id: string;
  file_id: string;
  payee_pattern: string;
  match_field: 'payee' | 'imported_payee' | 'notes';
  match_op: 'is' | 'contains';
  category: string;
  hit_count: number;
  status: 'pending' | 'accepted' | 'dismissed';
  created_at: string;
};

export type Insight = {
  id: string;
  type:
    | 'expiring-contracts'
    | 'budget-overspend'
    | 'recurring-untracked'
    | 'forecast-danger';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
};

export type Recommendation = {
  id: string;
  type: 'create-contract' | 'cancel-suggestion' | 'rule-creation';
  title: string;
  description: string;
  action?: { type: string; params: Record<string, unknown> };
  priority: 'low' | 'medium' | 'high';
};

export type StructuredQuery = {
  type: 'spending' | 'balance' | 'forecast' | 'contracts' | 'comparison';
  params: Record<string, unknown>;
};

export type QueryResult = {
  answer: string;
  data?: unknown[];
  chartData?: unknown;
};
