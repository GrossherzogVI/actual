// AI types shared within sync-server
// These mirror the types in loot-core/src/server/ai/types.ts

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
