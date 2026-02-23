import type { GatewayConfig } from '../config';

import { InMemoryGatewayQueue } from './in-memory-queue';
import type { GatewayQueue } from './types';

async function createInMemoryQueue(): Promise<GatewayQueue> {
  const inMemoryQueue = new InMemoryGatewayQueue();
  await inMemoryQueue.init();
  return inMemoryQueue;
}

export async function createGatewayQueue(config: GatewayConfig): Promise<GatewayQueue> {
  if (config.FINANCE_GATEWAY_QUEUE === 'memory') {
    return createInMemoryQueue();
  }

  if (!config.FINANCE_GATEWAY_REDIS_URL) {
    if (config.FINANCE_GATEWAY_ALLOW_FALLBACK) {
      console.warn(
        '[gateway] FINANCE_GATEWAY_REDIS_URL is missing for redis queue; using in-memory queue fallback.',
      );
      return createInMemoryQueue();
    }

    throw new Error(
      '[gateway] FINANCE_GATEWAY_REDIS_URL is required when FINANCE_GATEWAY_QUEUE=redis',
    );
  }

  try {
    const { RedisGatewayQueue } = await import('./redis-queue');
    const redisQueue = new RedisGatewayQueue(
      config.FINANCE_GATEWAY_REDIS_URL,
      config.FINANCE_GATEWAY_QUEUE_KEY,
    );

    await redisQueue.init();
    return redisQueue;
  } catch (error) {
    if (config.FINANCE_GATEWAY_ALLOW_FALLBACK) {
      console.warn(
        '[gateway] Unable to initialize redis queue; using in-memory queue fallback.',
        error,
      );
      return createInMemoryQueue();
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[gateway] Failed to initialize redis queue: ${message}`);
  }
}
