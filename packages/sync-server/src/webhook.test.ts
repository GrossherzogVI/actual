import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock account-db before importing webhook
vi.mock('./account-db.js', () => {
  const mockRows: Record<string, unknown> = {};
  const insertedDeliveries: unknown[][] = [];

  return {
    getAccountDb: () => ({
      first: (sql: string) => {
        if (sql.includes('webhook_config')) {
          return mockRows['webhook_config'] || null;
        }
        return null;
      },
      mutate: (_sql: string, params?: unknown[]) => {
        if (params) insertedDeliveries.push(params);
        return { changes: 1, insertId: 1 };
      },
      all: () => [],
      _setMockRow: (table: string, row: unknown) => {
        mockRows[table] = row;
      },
      _getDeliveries: () => insertedDeliveries,
      _reset: () => {
        Object.keys(mockRows).forEach(k => delete mockRows[k]);
        insertedDeliveries.length = 0;
      },
    }),
  };
});

vi.mock('./load-config.js', () => {
  const configValues: Record<string, string> = {
    'webhook.url': '',
    'webhook.secret': '',
  };

  return {
    config: {
      get: (key: string) => configValues[key],
      _setForTest: (key: string, value: string) => {
        configValues[key] = value;
      },
    },
  };
});

import { getAccountDb } from './account-db.js';
import { config } from './load-config.js';
import { dispatchWebhook, sendTestWebhook } from './webhook';

const mockConfig = config as unknown as {
  get: (key: string) => string;
  _setForTest: (key: string, value: string) => void;
};

const mockDb = getAccountDb() as unknown as {
  _setMockRow: (table: string, row: unknown) => void;
  _getDeliveries: () => unknown[][];
  _reset: () => void;
};

describe('webhook dispatcher', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('ok'),
    });
    vi.stubGlobal('fetch', fetchSpy);
    mockConfig._setForTest('webhook.url', '');
    mockConfig._setForTest('webhook.secret', '');
    mockDb._reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when no webhook is configured', () => {
    dispatchWebhook({
      type: 'sync',
      fileId: 'test-file',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reads config from DB when available', () => {
    mockDb._setMockRow('webhook_config', {
      url: 'http://n8n:5678/webhook/test',
      secret: 'db-secret',
      enabled: 1,
      events: '*',
    });

    dispatchWebhook({
      type: 'sync',
      fileId: 'test-file',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://n8n:5678/webhook/test');
  });

  it('falls back to env var when DB has no URL', () => {
    mockDb._setMockRow('webhook_config', {
      url: '',
      secret: '',
      enabled: 0,
      events: '*',
    });
    mockConfig._setForTest('webhook.url', 'http://env-webhook:5678/test');

    dispatchWebhook({
      type: 'sync',
      fileId: 'test-file',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://env-webhook:5678/test');
  });

  it('does not dispatch when webhook is disabled in DB', () => {
    mockDb._setMockRow('webhook_config', {
      url: 'http://n8n:5678/webhook/test',
      secret: '',
      enabled: 0,
      events: '*',
    });

    dispatchWebhook({
      type: 'sync',
      fileId: 'test-file',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('filters events based on config', () => {
    mockDb._setMockRow('webhook_config', {
      url: 'http://n8n:5678/webhook/test',
      secret: '',
      enabled: 1,
      events: 'sync', // only sync events
    });

    dispatchWebhook({
      type: 'file-upload',
      fileId: 'test-file',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(fetchSpy).not.toHaveBeenCalled();

    dispatchWebhook({
      type: 'sync',
      fileId: 'test-file',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('includes HMAC signature when secret is configured', () => {
    mockDb._setMockRow('webhook_config', {
      url: 'http://n8n:5678/webhook/test',
      secret: 'my-secret',
      enabled: 1,
      events: '*',
    });

    dispatchWebhook({
      type: 'sync',
      fileId: 'test-file',
      timestamp: '2024-01-01T00:00:00.000Z',
    });

    const [, options] = fetchSpy.mock.calls[0];
    const signature = options.headers['X-Actual-Signature'];
    expect(signature).toBeDefined();

    const expectedSignature = crypto
      .createHmac('sha256', 'my-secret')
      .update(options.body)
      .digest('hex');
    expect(signature).toBe(expectedSignature);
  });

  it('silently catches fetch errors', () => {
    mockDb._setMockRow('webhook_config', {
      url: 'http://n8n:5678/webhook/test',
      secret: '',
      enabled: 1,
      events: '*',
    });
    fetchSpy.mockRejectedValue(new Error('Connection refused'));

    expect(() => {
      dispatchWebhook({
        type: 'sync',
        fileId: 'test-file',
        timestamp: '2024-01-01T00:00:00.000Z',
      });
    }).not.toThrow();
  });
});

describe('sendTestWebhook', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('ok'),
    });
    vi.stubGlobal('fetch', fetchSpy);
    mockDb._reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a test event and returns success', async () => {
    const result = await sendTestWebhook('http://n8n:5678/test', 'secret');

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeNull();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers['X-Actual-Event']).toBe('test');
    const body = JSON.parse(options.body);
    expect(body._test).toBe(true);
  });

  it('returns failure on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await sendTestWebhook('http://unreachable:5678/test', '');

    expect(result.success).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('returns failure on HTTP error', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    });

    const result = await sendTestWebhook('http://n8n:5678/test', '');

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toBe('HTTP 500');
  });
});
