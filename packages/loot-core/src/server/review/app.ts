// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { del, get, patch, post } from '../post';
import { getServer } from '../server-config';

export type ReviewItem = {
  id: string;
  type:
  | 'uncategorized'
  | 'low_confidence'
  | 'recurring_detected'
  | 'amount_mismatch'
  | 'budget_suggestion'
  | 'parked_expense';
  priority: 'urgent' | 'review' | 'suggestion';
  transaction_id: string | null;
  contract_id: string | null;
  schedule_id: string | null;
  ai_suggestion: unknown | null;
  ai_confidence: number | null;
  status: 'pending' | 'accepted' | 'rejected' | 'snoozed' | 'dismissed';
  snoozed_until: string | null;
  resolved_at: string | null;
  resolved_action: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewCount = {
  pending: number;
  urgent: number;
  review: number;
  suggestion: number;
};

export type ReviewHandlers = {
  'review-list': typeof reviewList;
  'review-count': typeof reviewCount;
  'review-update': typeof reviewUpdate;
  'review-batch': typeof reviewBatch;
  'review-apply': typeof reviewApply;
  'review-dismiss': typeof reviewDismiss;
  'review-create': typeof reviewCreate;
  'review-batch-accept': typeof reviewBatchAccept;
  'review-accept': typeof reviewAccept;
  'review-reject': typeof reviewReject;
  'review-snooze': typeof reviewSnooze;
};

export const app = createApp<ReviewHandlers>();

app.method('review-list', reviewList);
app.method('review-count', reviewCount);
app.method('review-update', reviewUpdate);
app.method('review-batch', reviewBatch);
app.method('review-apply', reviewApply);
app.method('review-dismiss', reviewDismiss);
app.method('review-create', reviewCreate);
app.method('review-batch-accept', reviewBatchAccept);
app.method('review-accept', reviewAccept);
app.method('review-reject', reviewReject);
app.method('review-snooze', reviewSnooze);

async function reviewList(args?: {
  type?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}): Promise<ReviewItem[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams();
  if (args?.type) params.set('type', args.type);
  if (args?.priority) params.set('priority', args.priority);
  if (args?.limit) params.set('limit', String(args.limit));
  if (args?.offset) params.set('offset', String(args.offset));

  try {
    const data = await get(
      getServer().BASE_SERVER + `/review?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    return data;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function reviewCount(): Promise<ReviewCount | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const data = await get(
      getServer().BASE_SERVER + '/review/count',
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    return data;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function reviewUpdate(args: {
  id: string;
  status: 'accepted' | 'rejected' | 'snoozed' | 'dismissed';
  snoozed_until?: string;
}): Promise<ReviewItem | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await patch(
      getServer().BASE_SERVER + `/review/${args.id}`,
      { status: args.status, snoozed_until: args.snoozed_until },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ReviewItem;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

const ACTION_TO_STATUS: Record<string, string> = {
  accept: 'accepted',
  reject: 'rejected',
  dismiss: 'dismissed',
};

async function reviewBatch(args: {
  ids: string[];
  action: 'accept' | 'reject' | 'dismiss';
}): Promise<{ updated: number } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/review/batch',
      { ids: args.ids, status: ACTION_TO_STATUS[args.action] ?? args.action },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { updated: number };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function reviewApply(args: {
  id: string;
  action?: unknown;
}): Promise<{ applied: boolean; result: unknown } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/review/${args.id}/apply`,
      { action: args.action },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { applied: boolean; result: unknown };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function reviewDismiss(args: {
  id: string;
}): Promise<{ deleted: boolean } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await del(
      getServer().BASE_SERVER + `/review/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { deleted: boolean };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function reviewCreate(args: {
  type: ReviewItem['type'];
  priority: ReviewItem['priority'];
  amount?: number;
  category_id?: string;
  notes?: string;
}): Promise<ReviewItem | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/review',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ReviewItem;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function reviewBatchAccept(args?: {
  minConfidence?: number;
}): Promise<{ accepted: number; threshold: number } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/review/batch-accept',
      { minConfidence: args?.minConfidence ?? 0.9 },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { accepted: number; threshold: number };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function reviewAccept(args: {
  id: string;
}): Promise<{ accepted: boolean; suggestion: unknown } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/review/${args.id}/accept`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { accepted: boolean; suggestion: unknown };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function reviewReject(args: {
  id: string;
  correct_category_id?: string;
}): Promise<{ rejected: boolean; correct_category_id: string | null } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/review/${args.id}/reject`,
      { correct_category_id: args.correct_category_id },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { rejected: boolean; correct_category_id: string | null };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function reviewSnooze(args: {
  id: string;
  days?: number;
}): Promise<ReviewItem | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/review/${args.id}/snooze`,
      { days: args.days ?? 7 },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ReviewItem;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
