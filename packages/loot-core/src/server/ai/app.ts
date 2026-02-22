// @ts-strict-ignore
import type { ClassificationResult } from './types';

import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { del, get, post } from '../post';
import { getServer } from '../server-config';

export type SmartMatchRule = {
  id: string;
  payee_pattern: string;
  match_type: 'exact' | 'contains' | 'regex' | 'iban';
  category_id: string;
  tier: 'pinned' | 'ai_high' | 'ai_low';
  confidence: number;
  match_count: number;
  correct_count: number;
  last_matched_at: string | null;
  created_by: 'user' | 'ai' | 'import';
  created_at: string;
  updated_at: string;
};

export type AIStats = {
  total_rules: number;
  auto_rate: number;
  review_rate: number;
  accuracy: number;
};

export type AIHandlers = {
  'ai-classify': typeof aiClassify;
  'ai-classify-batch': typeof aiClassifyBatch;
  'ai-rules-list': typeof aiRulesList;
  'ai-rules-create': typeof aiRulesCreate;
  'ai-rules-delete': typeof aiRulesDelete;
  'ai-learn': typeof aiLearn;
  'ai-stats': typeof aiStats;
  'ai-auto-pin-check': typeof aiAutoPinCheck;
  'ai-promote-to-pinned': typeof aiPromoteToPinned;
};

export const app = createApp<AIHandlers>();

app.method('ai-classify', aiClassify);
app.method('ai-classify-batch', aiClassifyBatch);
app.method('ai-rules-list', aiRulesList);
app.method('ai-rules-create', aiRulesCreate);
app.method('ai-rules-delete', aiRulesDelete);
app.method('ai-learn', aiLearn);
app.method('ai-stats', aiStats);
app.method('ai-auto-pin-check', aiAutoPinCheck);
app.method('ai-promote-to-pinned', aiPromoteToPinned);

async function aiClassify(args: {
  transaction: unknown;
  categories: unknown;
}): Promise<ClassificationResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ai/classify',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ClassificationResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function aiClassifyBatch(args: {
  transactions: unknown[];
  categories: unknown;
}): Promise<
  | {
      results: ClassificationResult[];
      autoApplied: number;
      pendingReview: number;
      skipped: number;
    }
  | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ai/classify-batch',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as {
      results: ClassificationResult[];
      autoApplied: number;
      pendingReview: number;
      skipped: number;
    };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function aiRulesList(args?: {
  tier?: string;
  limit?: number;
}): Promise<SmartMatchRule[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams();
  if (args?.tier) params.set('tier', args.tier);
  if (args?.limit) params.set('limit', String(args.limit));

  try {
    const res = await get(
      getServer().BASE_SERVER + `/ai/rules?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function aiRulesCreate(args: {
  payee_pattern: string;
  match_type: 'exact' | 'contains' | 'regex' | 'iban';
  category_id: string;
  tier?: 'pinned' | 'ai_high' | 'ai_low';
}): Promise<SmartMatchRule | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ai/rules',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as SmartMatchRule;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function aiRulesDelete(args: {
  id: string;
}): Promise<{ deleted: boolean } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await del(
      getServer().BASE_SERVER + `/ai/rules/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { deleted: boolean };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function aiLearn(args: {
  transaction_id: string;
  correct_category_id: string;
  payee_pattern?: string;
}): Promise<{ learned: boolean; rule?: SmartMatchRule } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ai/learn',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { learned: boolean; rule?: SmartMatchRule };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function aiStats(): Promise<AIStats | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(
      getServer().BASE_SERVER + '/ai/stats',
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function aiAutoPinCheck(): Promise<
  | { candidates: Array<{ payee: string; category_id: string; count: number }> }
  | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ai/auto-pin-check',
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as {
      candidates: Array<{ payee: string; category_id: string; count: number }>;
    };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function aiPromoteToPinned(args: {
  payee_pattern: string;
  category_id: string;
  match_type?: 'exact' | 'contains' | 'regex' | 'iban';
}): Promise<{ promoted: boolean; rule?: SmartMatchRule } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ai/promote-to-pinned',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { promoted: boolean; rule?: SmartMatchRule };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
