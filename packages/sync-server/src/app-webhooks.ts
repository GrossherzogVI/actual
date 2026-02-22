import express from 'express';

import { getAccountDb } from './account-db.js';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from './util/middlewares.js';
import { sendTestWebhook } from './webhook.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

/** GET /webhooks/config — get current webhook configuration */
app.get('/config', (_req, res) => {
  const db = getAccountDb();
  const row = db.first(
    "SELECT url, secret, enabled, events, updated_at FROM webhook_config WHERE id = 'default'",
  );

  if (!row) {
    res.json({
      status: 'ok',
      data: { url: '', secret: '', enabled: false, events: 'sync,file-upload,file-delete' },
    });
    return;
  }

  res.json({
    status: 'ok',
    data: {
      url: row.url,
      // Mask the secret — only show first 4 and last 4 chars
      secret: row.secret ? maskSecret(row.secret) : '',
      secretSet: !!row.secret,
      enabled: !!row.enabled,
      events: row.events,
      updatedAt: row.updated_at,
    },
  });
});

/** PATCH /webhooks/config — update webhook configuration */
app.patch('/config', (req, res) => {
  const { url, secret, enabled, events } = req.body || {};
  const db = getAccountDb();

  // Build update fields dynamically (only update what's provided)
  const updates: string[] = [];
  const params: unknown[] = [];

  if (url !== undefined) {
    if (url && !isValidUrl(url)) {
      res.status(400).json({ status: 'error', reason: 'invalid-url' });
      return;
    }
    updates.push('url = ?');
    params.push(url);
  }

  if (secret !== undefined) {
    updates.push('secret = ?');
    params.push(secret);
  }

  if (enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(enabled ? 1 : 0);
  }

  if (events !== undefined) {
    updates.push('events = ?');
    params.push(events);
  }

  if (updates.length === 0) {
    res.status(400).json({ status: 'error', reason: 'no-fields-to-update' });
    return;
  }

  updates.push("updated_at = datetime('now')");

  db.mutate(
    `UPDATE webhook_config SET ${updates.join(', ')} WHERE id = 'default'`,
    params,
  );

  res.json({ status: 'ok' });
});

/** POST /webhooks/test — send a test webhook and return the result */
app.post('/test', async (req, res) => {
  const { url, secret } = req.body || {};

  // Use provided URL/secret or fall back to saved config
  let testUrl = url;
  let testSecret = secret;

  if (!testUrl) {
    const db = getAccountDb();
    const row = db.first(
      "SELECT url, secret FROM webhook_config WHERE id = 'default'",
    );
    if (!row || !row.url) {
      res.status(400).json({
        status: 'error',
        reason: 'no-webhook-configured',
      });
      return;
    }
    testUrl = row.url;
    testSecret = secret !== undefined ? secret : row.secret;
  }

  if (!isValidUrl(testUrl)) {
    res.status(400).json({ status: 'error', reason: 'invalid-url' });
    return;
  }

  const result = await sendTestWebhook(testUrl, testSecret || '');

  res.json({
    status: 'ok',
    data: result,
  });
});

/** GET /webhooks/deliveries — get recent delivery log */
app.get('/deliveries', (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit), 10) || 50, 200);
  const db = getAccountDb();

  const deliveries = db.all(
    `SELECT id, event_type, status_code, duration_ms, success, error, attempt, created_at
     FROM webhook_deliveries
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
  );

  // Get summary stats
  const stats = db.first(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
      MAX(CASE WHEN success = 1 THEN created_at END) as last_success,
      MAX(CASE WHEN success = 0 THEN created_at END) as last_failure
    FROM webhook_deliveries
    WHERE created_at > datetime('now', '-24 hours')
  `);

  res.json({
    status: 'ok',
    data: {
      deliveries: deliveries.map((d: any) => ({
        id: d.id,
        eventType: d.event_type,
        statusCode: d.status_code,
        durationMs: d.duration_ms,
        success: !!d.success,
        error: d.error,
        attempt: d.attempt,
        createdAt: d.created_at,
      })),
      stats: {
        total24h: stats?.total || 0,
        successful24h: stats?.successful || 0,
        failed24h: stats?.failed || 0,
        lastSuccess: stats?.last_success || null,
        lastFailure: stats?.last_failure || null,
      },
    },
  });
});

/** DELETE /webhooks/deliveries — clear delivery log */
app.delete('/deliveries', (_req, res) => {
  const db = getAccountDb();
  db.mutate('DELETE FROM webhook_deliveries');
  res.json({ status: 'ok' });
});

function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••••••';
  return secret.slice(0, 4) + '••••' + secret.slice(-4);
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
