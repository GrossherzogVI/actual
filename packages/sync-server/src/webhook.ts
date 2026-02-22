import crypto from 'node:crypto';

import { getAccountDb } from './account-db.js';
import { config } from './load-config.js';

export type WebhookEventType =
  | 'sync'
  | 'file-upload'
  | 'file-delete'
  | 'deadline.action_due'
  | 'deadline.soft_passed'
  | 'deadline.hard_passed';

export type WebhookEvent = {
  type: WebhookEventType;
  fileId: string | null;
  groupId?: string | null;
  messageCount?: number;
  timestamp: string;
  // Populated for deadline.* events
  contractId?: string;
  contractName?: string;
  nominalDate?: string;
  actionDate?: string;
  softDate?: string;
  hardDate?: string;
};

type WebhookConfig = {
  url: string;
  secret: string;
  enabled: boolean;
  events: string; // comma-separated event types
};

const RETRY_DELAY_MS = 3000;
const TIMEOUT_MS = 5000;
const MAX_DELIVERIES = 200; // keep last N deliveries

/** Read webhook config from DB, falling back to env vars */
function getWebhookConfig(): WebhookConfig | null {
  try {
    const db = getAccountDb();
    const row = db.first(
      "SELECT url, secret, enabled, events FROM webhook_config WHERE id = 'default'",
    );

    if (row && row.url) {
      return {
        url: row.url,
        secret: row.secret || '',
        enabled: !!row.enabled,
        events: row.events || '*',
      };
    }
  } catch {
    // DB not ready yet (before migration) — fall through to env vars
  }

  // Fallback to env vars for backwards compatibility
  const envUrl = config.get('webhook.url');
  if (envUrl) {
    return {
      url: envUrl,
      secret: config.get('webhook.secret') || '',
      enabled: true,
      events: '*',
    };
  }

  return null;
}

function isEventEnabled(webhookConfig: WebhookConfig, eventType: string): boolean {
  if (webhookConfig.events === '*') return true;
  return webhookConfig.events.split(',').map(e => e.trim()).includes(eventType);
}

function buildSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function logDelivery(
  eventType: string,
  url: string,
  payload: string,
  statusCode: number | null,
  responseBody: string | null,
  durationMs: number,
  success: boolean,
  error: string | null,
  attempt: number,
): void {
  try {
    const db = getAccountDb();
    db.mutate(
      `INSERT INTO webhook_deliveries (event_type, url, payload, status_code, response_body, duration_ms, success, error, attempt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventType, url, payload, statusCode, responseBody, durationMs, success ? 1 : 0, error, attempt],
    );

    // Prune old deliveries
    db.mutate(
      `DELETE FROM webhook_deliveries WHERE id NOT IN (
        SELECT id FROM webhook_deliveries ORDER BY created_at DESC LIMIT ?
      )`,
      [MAX_DELIVERIES],
    );
  } catch (err) {
    console.warn(`[Webhook] Failed to log delivery: ${(err as Error).message}`);
  }
}

async function sendWebhook(
  url: string,
  payload: string,
  headers: Record<string, string>,
  eventType: string,
  attempt: number,
): Promise<void> {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const durationMs = Date.now() - start;
    const responseBody = await response.text().catch(() => null);

    logDelivery(
      eventType,
      url,
      payload,
      response.status,
      responseBody,
      durationMs,
      response.ok,
      response.ok ? null : `HTTP ${response.status}`,
      attempt,
    );

    if (!response.ok && attempt === 1) {
      // Retry once after delay
      setTimeout(() => {
        sendWebhook(url, payload, headers, eventType, 2).catch(() => {});
      }, RETRY_DELAY_MS);
    }
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = (err as Error).message;

    logDelivery(eventType, url, payload, null, null, durationMs, false, errorMsg, attempt);

    if (attempt === 1) {
      setTimeout(() => {
        sendWebhook(url, payload, headers, eventType, 2).catch(() => {});
      }, RETRY_DELAY_MS);
    }
  }
}

export function dispatchWebhook(event: WebhookEvent): void {
  const webhookConfig = getWebhookConfig();
  if (!webhookConfig || !webhookConfig.enabled) return;
  if (!isEventEnabled(webhookConfig, event.type)) return;

  const payload = JSON.stringify(event);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Actual-Event': event.type,
  };

  if (webhookConfig.secret) {
    headers['X-Actual-Signature'] = buildSignature(payload, webhookConfig.secret);
  }

  // Fire-and-forget with delivery logging
  sendWebhook(webhookConfig.url, payload, headers, event.type, 1).catch(() => {});
}

/** Send a test event to verify the webhook configuration. Returns the delivery result. */
export async function sendTestWebhook(
  url: string,
  secret: string,
): Promise<{ success: boolean; statusCode: number | null; error: string | null; durationMs: number }> {
  const testEvent: WebhookEvent = {
    type: 'sync',
    fileId: 'test',
    groupId: 'test',
    messageCount: 0,
    timestamp: new Date().toISOString(),
  };

  const payload = JSON.stringify({ ...testEvent, _test: true });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Actual-Event': 'test',
  };

  if (secret) {
    headers['X-Actual-Signature'] = buildSignature(payload, secret);
  }

  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const durationMs = Date.now() - start;
    const responseBody = await response.text().catch(() => null);

    logDelivery('test', url, payload, response.status, responseBody, durationMs, response.ok, response.ok ? null : `HTTP ${response.status}`, 1);

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? null : `HTTP ${response.status}`,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - start;
    const errorMsg = (err as Error).message;

    logDelivery('test', url, payload, null, null, durationMs, false, errorMsg, 1);

    return {
      success: false,
      statusCode: null,
      error: errorMsg,
      durationMs,
    };
  }
}
