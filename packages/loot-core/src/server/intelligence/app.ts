// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get } from '../post';
import { getServer } from '../server-config';

export type Insight = {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
};

export type Recommendation = {
  id: string;
  type: string;
  title: string;
  description: string;
  action?: { type: string; params: Record<string, unknown> };
  priority: 'low' | 'medium' | 'high';
};

export type IntelligenceHandlers = {
  'intelligence-insights': typeof getInsights;
  'intelligence-recommendations': typeof getRecommendations;
};

export const app = createApp<IntelligenceHandlers>();

app.method('intelligence-insights', getInsights);
app.method('intelligence-recommendations', getRecommendations);

async function getInsights(args: {
  fileId: string;
}): Promise<Insight[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams({ fileId: args.fileId });

  try {
    const res = await get(
      getServer().BASE_SERVER + `/intelligence?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data.insights;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function getRecommendations(args: {
  fileId: string;
}): Promise<Recommendation[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams({ fileId: args.fileId });

  try {
    const res = await get(
      getServer().BASE_SERVER + `/intelligence?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data.recommendations;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}
