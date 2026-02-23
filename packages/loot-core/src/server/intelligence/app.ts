// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import {
  createGatewayEnvelope,
  gatewayPost,
} from '../financeos-gateway';

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
    return await gatewayPost<Array<Record<string, unknown>>>(
      '/intelligence/v1/recommend',
      {
        envelope: createGatewayEnvelope('intelligence-recommend'),
        context: args?.context,
      },
      userToken,
    );
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
    return await gatewayPost<Record<string, unknown>>(
      '/intelligence/v1/explain',
      {
        envelope: createGatewayEnvelope('intelligence-explain'),
        recommendation: args.recommendation,
      },
      userToken,
    );
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
    return await gatewayPost<Record<string, unknown>>(
      '/intelligence/v1/classify',
      {
        envelope: createGatewayEnvelope('intelligence-classify'),
        payee: args.payee,
        amount: args.amount,
      },
      userToken,
    );
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
    return await gatewayPost<Record<string, unknown>>(
      '/intelligence/v1/forecast',
      {
        envelope: createGatewayEnvelope('intelligence-forecast'),
        months: args?.months ?? 6,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
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
    return await gatewayPost<Record<string, unknown>>(
      '/intelligence/v1/learn-correction',
      {
        envelope: createGatewayEnvelope('intelligence-learn-correction'),
        input: args.input,
        correctOutput: args.correctOutput ?? {},
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}
