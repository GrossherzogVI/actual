// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

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

async function focusAdaptivePanel(): Promise<
  Record<string, unknown> | HandlerError
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const res = await get(
      getServer().BASE_SERVER + '/ops/focus/adaptive-panel',
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
  return { error: 'no-response' };
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
    const result = await post(
      getServer().BASE_SERVER + '/ops/focus/record-action-outcome',
      {
        actionId: args.actionId ?? '',
        outcome: args.outcome,
        notes: args.notes,
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}
