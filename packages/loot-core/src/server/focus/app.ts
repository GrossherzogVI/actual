// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

export type FocusHandlers = {
  'focus-adaptive-panel': typeof focusAdaptivePanel;
  'focus-record-action-outcome': typeof focusRecordActionOutcome;
};

export const app = createApp<FocusHandlers>();

app.method('focus-adaptive-panel', focusAdaptivePanel);
app.method('focus-record-action-outcome', focusRecordActionOutcome);

async function focusAdaptivePanel(): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/focus/adaptive-panel', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });

    const parsed = JSON.parse(res);
    return parsed.data as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function focusRecordActionOutcome(args: {
  action_id: string;
  outcome: string;
  notes?: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/focus/record-action-outcome',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
