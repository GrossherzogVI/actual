import { describe, expect, it } from 'vitest';

import { loadGatewayConfig } from '../config';
import { createGatewayQueue } from '../queue/factory';
import { createGatewayRepository } from '../repositories/factory';

describe('gateway infrastructure defaults', () => {
  it('defaults to strict postgres + redis modes', () => {
    const config = loadGatewayConfig({});

    expect(config.FINANCE_GATEWAY_STORE).toBe('postgres');
    expect(config.FINANCE_GATEWAY_QUEUE).toBe('redis');
    expect(config.FINANCE_GATEWAY_INTERNAL_TOKEN).toBe('');
    expect(config.FINANCE_GATEWAY_ACTIVITY_STARTUP_MODE).toBe('non-blocking');
    expect(config.FINANCE_GATEWAY_ACTIVITY_BACKFILL_LIMIT_PER_PLANE).toBe(500);
    expect(config.FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_INTERVAL_MINUTES).toBe(0);
  });

  it('parses activity maintenance booleans from env strings safely', () => {
    const config = loadGatewayConfig({
      FINANCE_GATEWAY_ACTIVITY_BACKFILL_ON_START: 'false',
      FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_ON_START: '0',
    });

    expect(config.FINANCE_GATEWAY_ACTIVITY_BACKFILL_ON_START).toBe(false);
    expect(config.FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_ON_START).toBe(false);
  });
});

describe('gateway infrastructure strict startup', () => {
  it('fails when postgres repository is selected without database url', async () => {
    const strictConfig = loadGatewayConfig({
      FINANCE_GATEWAY_STORE: 'postgres',
    });

    await expect(createGatewayRepository(strictConfig)).rejects.toThrow(
      /FINANCE_GATEWAY_DATABASE_URL/i,
    );
  });

  it('fails when redis queue is selected without redis url', async () => {
    const strictConfig = loadGatewayConfig({
      FINANCE_GATEWAY_STORE: 'memory',
      FINANCE_GATEWAY_QUEUE: 'redis',
    } as NodeJS.ProcessEnv);

    await expect(createGatewayQueue(strictConfig)).rejects.toThrow(
      /FINANCE_GATEWAY_REDIS_URL/i,
    );
  });
});
