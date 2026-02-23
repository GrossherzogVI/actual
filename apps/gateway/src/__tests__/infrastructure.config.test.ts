import { describe, expect, it } from 'vitest';

import { loadGatewayConfig } from '../config';
import { createGatewayQueue } from '../queue/factory';
import { createGatewayRepository } from '../repositories/factory';

describe('gateway infrastructure defaults', () => {
  it('defaults to strict postgres + redis modes', () => {
    const config = loadGatewayConfig({});
    const view = config as unknown as Record<string, unknown>;

    expect(config.FINANCE_GATEWAY_STORE).toBe('postgres');
    expect(view.FINANCE_GATEWAY_QUEUE).toBe('redis');
    expect(view.FINANCE_GATEWAY_ALLOW_FALLBACK).toBe(false);
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
