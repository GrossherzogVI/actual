import { createClient, type RedisClientType } from 'redis';
import { customAlphabet } from 'nanoid';

import type {
  ClaimedQueueJob,
  DequeueOptions,
  GatewayQueue,
  QueueJob,
} from './types';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 12);
const DEFAULT_VISIBILITY_TIMEOUT_MS = 60_000;

type StoredJob = {
  job: QueueJob;
  attempt: number;
};

export class RedisGatewayQueue implements GatewayQueue {
  readonly kind = 'redis' as const;

  private readonly readyKey: string;
  private readonly payloadKey: string;
  private readonly processingKey: string;

  private readonly client: RedisClientType;

  constructor(
    redisUrl: string,
    queueKey: string,
  ) {
    this.readyKey = `${queueKey}:ready`;
    this.payloadKey = `${queueKey}:payload`;
    this.processingKey = `${queueKey}:processing`;

    this.client = createClient({
      url: redisUrl,
    });
  }

  async init(): Promise<void> {
    await this.client.connect();
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async enqueue(job: QueueJob): Promise<void> {
    const receipt = `${job.id}:${nanoid()}`;
    const record: StoredJob = {
      job,
      attempt: 0,
    };

    await this.client.hSet(this.payloadKey, receipt, JSON.stringify(record));
    await this.client.lPush(this.readyKey, receipt);
  }

  async dequeue(
    maxJobs: number,
    options?: DequeueOptions,
  ): Promise<ClaimedQueueJob[]> {
    const visibilityTimeoutMs =
      options?.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS;
    const jobs: ClaimedQueueJob[] = [];

    for (let index = 0; index < maxJobs; index++) {
      const receipt = await this.client.rPop(this.readyKey);
      if (!receipt) {
        break;
      }

      const raw = await this.client.hGet(this.payloadKey, receipt);
      if (!raw) {
        continue;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object') continue;

      const stored = parsed as StoredJob;
      const claimedAtMs = Date.now();
      const visibleAtMs = claimedAtMs + visibilityTimeoutMs;
      const attempt = Number(stored.attempt || 0) + 1;

      const updated: StoredJob = {
        job: stored.job,
        attempt,
      };

      await this.client.hSet(this.payloadKey, receipt, JSON.stringify(updated));
      await this.client.zAdd(this.processingKey, {
        score: visibleAtMs,
        value: receipt,
      });

      jobs.push({
        ...stored.job,
        receipt,
        attempt,
        claimedAtMs,
        visibleAtMs,
      });
    }

    return jobs;
  }

  async ack(receipt: string): Promise<boolean> {
    const removed = await this.client.zRem(this.processingKey, receipt);
    if (removed < 1) {
      return false;
    }

    await this.client.hDel(this.payloadKey, receipt);
    return true;
  }

  async nack(receipt: string, requeue: boolean): Promise<boolean> {
    const removed = await this.client.zRem(this.processingKey, receipt);
    if (removed < 1) {
      return false;
    }

    if (requeue) {
      await this.client.lPush(this.readyKey, receipt);
    } else {
      await this.client.hDel(this.payloadKey, receipt);
    }

    return true;
  }

  async requeueExpired(limit: number): Promise<number> {
    if (limit <= 0) return 0;

    const now = Date.now();
    const receipts = await this.client.zRangeByScore(
      this.processingKey,
      0,
      now,
      {
        LIMIT: {
          offset: 0,
          count: limit,
        },
      },
    );

    let moved = 0;
    for (const receipt of receipts) {
      const removed = await this.client.zRem(this.processingKey, receipt);
      if (removed < 1) continue;
      await this.client.lPush(this.readyKey, receipt);
      moved += 1;
    }

    return moved;
  }

  async size(): Promise<number> {
    return this.client.lLen(this.readyKey);
  }

  async inFlightSize(): Promise<number> {
    return this.client.zCard(this.processingKey);
  }
}
