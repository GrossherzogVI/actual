// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { post } from '../post';
import { getServer } from '../server-config';

export type IntelligenceHandlers = {
  'intelligence-recommend': typeof intelligenceRecommend;
  'intelligence-explain': typeof intelligenceExplain;
  'intelligence-classify': typeof intelligenceClassify;
  'intelligence-forecast': typeof intelligenceForecast;
  'intelligence-learn-correction': typeof intelligenceLearnCorrection;
};

export const app = createApp<IntelligenceHandlers>();

app.method('intelligence-recommend', intelligenceRecommend);
app.method('intelligence-explain', intelligenceExplain);
app.method('intelligence-classify', intelligenceClassify);
app.method('intelligence-forecast', intelligenceForecast);
app.method('intelligence-learn-correction', intelligenceLearnCorrection);

async function intelligenceRecommend(args?: {
  context?: Record<string, unknown>;
}): Promise<Array<Record<string, unknown>> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/intelligence/recommend',
      args || {},
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Array<Record<string, unknown>>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function intelligenceExplain(args: {
  recommendation: Record<string, unknown>;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/intelligence/explain',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function intelligenceClassify(args: {
  payee: string;
  amount?: number;
  iban?: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/intelligence/classify',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function intelligenceForecast(args?: {
  months?: number;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/intelligence/forecast',
      { months: args?.months ?? 6 },
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function intelligenceLearnCorrection(args: {
  input: Record<string, unknown>;
  correct_output: Record<string, unknown>;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/intelligence/learn-correction',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
