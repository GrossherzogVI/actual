// Shared types for the Review Queue module.
// These are defined locally (sync-server cannot be imported by loot-core consumers).

export type ReviewItemType =
  | 'uncategorized'
  | 'low_confidence'
  | 'recurring_detected'
  | 'amount_mismatch'
  | 'budget_suggestion'
  | 'parked_expense';

export type ReviewItemPriority = 'urgent' | 'review' | 'suggestion';

export type ReviewItemStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'snoozed'
  | 'dismissed';

export interface ReviewItem {
  id: string;
  type: ReviewItemType;
  priority: ReviewItemPriority;
  transaction_id: string | null;
  contract_id: string | null;
  schedule_id: string | null;
  /** JSON string: { category_id?, confidence?, payee_pattern?, label?, ... } */
  ai_suggestion: string | null;
  /** 0.0 – 1.0 */
  ai_confidence: number | null;
  status: ReviewItemStatus;
  snoozed_until: string | null;
  resolved_at: string | null;
  resolved_action: string | null;
  created_at: string;
  updated_at: string;
  // Optional: payload fields the server may denormalize for display
  transaction_payee?: string | null;
  transaction_amount?: number | null; // cents
}

export interface ReviewCount {
  pending: number;
  urgent: number;
  review: number;
  suggestion: number;
}

/** Parsed shape of ReviewItem.ai_suggestion JSON */
export interface AiSuggestion {
  category_id?: string;
  category_name?: string;
  confidence?: number;
  payee_pattern?: string;
  label?: string;
  notes?: string;
}

// ---- Filter types ----

export type TypeFilter =
  | 'all'
  | 'uncategorized'
  | 'low_confidence'
  | 'recurring_detected'
  | 'amount_mismatch'
  | 'budget_suggestion'
  | 'parked_expense';

export type PriorityFilter = 'all' | 'urgent' | 'review' | 'suggestion';

// ---- Option tuples for Select ----

export const TYPE_FILTER_OPTIONS: Array<[TypeFilter, string]> = [
  ['all', 'All Types'],
  ['uncategorized', 'Uncategorized'],
  ['low_confidence', 'Low Confidence'],
  ['recurring_detected', 'Recurring'],
  ['amount_mismatch', 'Amount Mismatch'],
  ['budget_suggestion', 'Budget Suggestion'],
  ['parked_expense', 'Parked'],
];

export const PRIORITY_FILTER_OPTIONS: Array<[PriorityFilter, string]> = [
  ['all', 'All Priorities'],
  ['urgent', 'Urgent'],
  ['review', 'Review'],
  ['suggestion', 'Suggestion'],
];

// ---- Color constants ----

export const PRIORITY_BORDER_COLORS: Record<ReviewItemPriority, string> = {
  urgent: '#ef4444',
  review: '#f59e0b',
  suggestion: '#3b82f6',
};

export const PRIORITY_LABEL_COLORS: Record<ReviewItemPriority, string> = {
  urgent: '#ef4444',
  review: '#f59e0b',
  suggestion: '#3b82f6',
};

// ---- Helpers ----

/** Safely parses ai_suggestion JSON; returns null on failure. */
export function parseAiSuggestion(raw: string | null): AiSuggestion | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AiSuggestion;
  } catch {
    return null;
  }
}

/** Returns human-readable title for a review item. */
export function getItemTitle(item: ReviewItem): string {
  const payee = item.transaction_payee ?? null;
  switch (item.type) {
    case 'uncategorized':
      return payee ? `Uncategorized: ${payee}` : 'Uncategorized transaction';
    case 'low_confidence':
      return payee ? `Low confidence: ${payee}` : 'Low confidence classification';
    case 'recurring_detected': {
      const suggestion = parseAiSuggestion(item.ai_suggestion);
      const pattern = suggestion?.payee_pattern ?? payee;
      return pattern ? `Recurring pattern: ${pattern}` : 'Recurring pattern detected';
    }
    case 'amount_mismatch':
      return payee ? `Amount mismatch: ${payee}` : 'Amount mismatch detected';
    case 'budget_suggestion': {
      const suggestion = parseAiSuggestion(item.ai_suggestion);
      return suggestion?.label ?? 'Budget suggestion';
    }
    case 'parked_expense':
      return payee ? `Parked: ${payee}` : 'Parked expense';
    default:
      return 'Review item';
  }
}

/** Returns subtitle / AI suggestion text for display. */
export function getItemSubtitle(item: ReviewItem): string | null {
  const suggestion = parseAiSuggestion(item.ai_suggestion);
  if (!suggestion) return null;

  if (suggestion.category_name) {
    const pct =
      item.ai_confidence != null
        ? ` (${Math.round(item.ai_confidence * 100)}% confidence)`
        : '';
    return `Suggested category: ${suggestion.category_name}${pct}`;
  }
  if (suggestion.label) {
    return suggestion.label;
  }
  if (suggestion.notes) {
    return suggestion.notes;
  }
  return null;
}
