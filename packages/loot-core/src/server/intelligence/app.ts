// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

type HandlerError = { error: string };

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

function readError(err: unknown, fallback = 'unknown') {
  return (
    (err as { reason?: string; message?: string })?.reason ||
    (err as { reason?: string; message?: string })?.message ||
    fallback
  );
}

async function intelligenceRecommend(args?: {
  context?: Record<string, unknown>;
}): Promise<Array<Record<string, unknown>> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/intelligence/corrections',
      { context: args?.context },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Array<Record<string, unknown>>;
  } catch (err) {
    return { error: readError(err) };
  }
}

async function intelligenceExplain(args: {
  recommendation: Record<string, unknown>;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/intelligence/classify-feedback',
      { recommendation: args.recommendation },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}

async function intelligenceClassify(args: {
  payee: string;
  amount?: number;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/intelligence/classify-feedback',
      {
        payee: args.payee,
        amount: args.amount,
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}

async function intelligenceForecast(args?: {
  months?: number;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const res = await get(getServer().BASE_SERVER + '/ops/intelligence/stats', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: readError(err) };
  }
  return { error: 'no-response' };
}

async function intelligenceLearnCorrection(args: {
  input: Record<string, unknown>;
  correctOutput?: Record<string, unknown>;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/intelligence/corrections',
      {
        input: args.input,
        correctOutput: args.correctOutput ?? {},
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}
