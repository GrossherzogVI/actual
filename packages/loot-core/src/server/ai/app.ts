// @ts-strict-ignore
import type {
  AIClassificationEntity,
  AIRuleSuggestionEntity,
  ClassificationResult,
} from './types';

import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

export type AIHandlers = {
  'ai-classify': typeof aiClassify;
  'ai-classify-batch': typeof aiClassifyBatch;
  'ai-queue-list': typeof aiQueueList;
  'ai-queue-resolve': typeof aiQueueResolve;
  'ai-rule-suggestions': typeof aiRuleSuggestions;
  'ai-rule-accept': typeof aiRuleAccept;
};

export const app = createApp<AIHandlers>();

app.method('ai-classify', aiClassify);
app.method('ai-classify-batch', aiClassifyBatch);
app.method('ai-queue-list', aiQueueList);
app.method('ai-queue-resolve', aiQueueResolve);
app.method('ai-rule-suggestions', aiRuleSuggestions);
app.method('ai-rule-accept', aiRuleAccept);

async function aiClassify(args: {
  transaction: unknown;
  categories: unknown;
  fileId: string;
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
  fileId: string;
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

async function aiQueueList(args: {
  fileId: string;
  limit?: number;
}): Promise<AIClassificationEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams({ fileId: args.fileId });
  if (args.limit) params.set('limit', String(args.limit));

  try {
    const res = await get(
      getServer().BASE_SERVER + `/ai/queue?${params.toString()}`,
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

async function aiQueueResolve(args: {
  id: string;
  status: 'accepted' | 'rejected';
}): Promise<AIClassificationEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/ai/queue/${args.id}/resolve`,
      { status: args.status },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as AIClassificationEntity;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function aiRuleSuggestions(args: {
  fileId: string;
  minHitCount?: number;
}): Promise<AIRuleSuggestionEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams({ fileId: args.fileId });
  if (args.minHitCount) params.set('minHitCount', String(args.minHitCount));

  try {
    const res = await get(
      getServer().BASE_SERVER + `/ai/rule-suggestions?${params.toString()}`,
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

async function aiRuleAccept(args: {
  id: string;
}): Promise<
  { ruleCreated: boolean; suggestion: AIRuleSuggestionEntity } | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/ai/rule-suggestions/${args.id}/accept`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { ruleCreated: boolean; suggestion: AIRuleSuggestionEntity };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
