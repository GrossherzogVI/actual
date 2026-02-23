// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import {
  createGatewayEnvelope,
  gatewayGet,
  gatewayPost,
} from '../financeos-gateway';

type HandlerError = { error: string };

export type FocusHandlers = {
  'focus-adaptive-panel': typeof focusAdaptivePanel;
  'focus-record-action-outcome': typeof focusRecordActionOutcome;
};

export const app = createApp<FocusHandlers>();

app.method('focus-adaptive-panel', focusAdaptivePanel);
app.method('focus-record-action-outcome', focusRecordActionOutcome);

function readError(err: unknown, fallback = 'unknown') {
  return (
    (err as { reason?: string; message?: string })?.reason ||
    (err as { reason?: string; message?: string })?.message ||
    fallback
  );
}

async function focusAdaptivePanel(): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayGet<Record<string, unknown>>('/focus/v1/adaptive-panel', userToken);
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function focusRecordActionOutcome(args: {
  actionId?: string;
  outcome: string;
  notes?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/focus/v1/record-action-outcome',
      {
        envelope: createGatewayEnvelope('record-action-outcome'),
        actionId: args.actionId ?? '',
        outcome: args.outcome,
        notes: args.notes,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}
