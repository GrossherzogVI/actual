import type { GatewayConfig } from '../config';

import { InMemoryGatewayQueue } from './in-memory-queue';
import { RedisGatewayQueue } from './redis-queue';
import type { GatewayQueue } from './types';

export async function createGatewayQueue(config: GatewayConfig): Promise<GatewayQueue> {
  if (config.FINANCE_GATEWAY_REDIS_URL) {
    const redisQueue = new RedisGatewayQueue(
      config.FINANCE_GATEWAY_REDIS_URL,
      config.FINANCE_GATEWAY_QUEUE_KEY,
    );

    try {
      await redisQueue.init();
      return redisQueue;
    } catch (error) {
      console.warn(
        '[gateway] Unable to connect to Redis queue, using in-memory queue fallback.',
        error,
      );
    }
  }

  const inMemoryQueue = new InMemoryGatewayQueue();
  await inMemoryQueue.init();
  return inMemoryQueue;
}
