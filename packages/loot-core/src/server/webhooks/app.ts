// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { del, get, patch, post } from '../post';
import { getServer } from '../server-config';

export type WebhookConfig = {
  url: string;
  secret: string;
  secretSet: boolean;
  enabled: boolean;
  events: string;
  updatedAt: string | null;
};

export type WebhookDelivery = {
  id: number;
  eventType: string;
  statusCode: number | null;
  durationMs: number | null;
  success: boolean;
  error: string | null;
  attempt: number;
  createdAt: string;
};

export type WebhookDeliveryStats = {
  total24h: number;
  successful24h: number;
  failed24h: number;
  lastSuccess: string | null;
  lastFailure: string | null;
};

export type WebhookTestResult = {
  success: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
};

export type WebhookHandlers = {
  'webhook-get-config': typeof getWebhookConfig;
  'webhook-update-config': typeof updateWebhookConfig;
  'webhook-test': typeof testWebhook;
  'webhook-get-deliveries': typeof getDeliveries;
  'webhook-clear-deliveries': typeof clearDeliveries;
};

export const app = createApp<WebhookHandlers>();

app.method('webhook-get-config', getWebhookConfig);
app.method('webhook-update-config', updateWebhookConfig);
app.method('webhook-test', testWebhook);
app.method('webhook-get-deliveries', getDeliveries);
app.method('webhook-clear-deliveries', clearDeliveries);

async function getWebhookConfig(): Promise<WebhookConfig | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/webhooks/config', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });
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

async function updateWebhookConfig(config: {
  url?: string;
  secret?: string;
  enabled?: boolean;
  events?: string;
}): Promise<{ error?: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    await patch(getServer().BASE_SERVER + '/webhooks/config', config, {
      'X-ACTUAL-TOKEN': userToken,
    });
    return {};
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function testWebhook(args?: {
  url?: string;
  secret?: string;
}): Promise<WebhookTestResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/webhooks/test',
      args || {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as WebhookTestResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function getDeliveries(args?: {
  limit?: number;
}): Promise<
  | { deliveries: WebhookDelivery[]; stats: WebhookDeliveryStats }
  | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const limit = args?.limit || 50;
  try {
    const res = await get(
      getServer().BASE_SERVER + `/webhooks/deliveries?limit=${limit}`,
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

async function clearDeliveries(): Promise<{ error?: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    await del(getServer().BASE_SERVER + '/webhooks/deliveries', {}, {
      'X-ACTUAL-TOKEN': userToken,
    });
    return {};
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
