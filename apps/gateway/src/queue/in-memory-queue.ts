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

type InFlightRecord = {
  claimedAtMs: number;
  visibleAtMs: number;
};

export class InMemoryGatewayQueue implements GatewayQueue {
  readonly kind = 'memory' as const;

  private readonly readyReceipts: string[] = [];
  private readonly jobs = new Map<string, StoredJob>();
  private readonly inFlight = new Map<string, InFlightRecord>();

  async init(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    this.readyReceipts.length = 0;
    this.jobs.clear();
    this.inFlight.clear();
  }

  async enqueue(job: QueueJob): Promise<void> {
    const receipt = `${job.id}:${nanoid()}`;
    this.jobs.set(receipt, {
      job,
      attempt: 0,
    });
    this.readyReceipts.push(receipt);
  }

  async dequeue(
    maxJobs: number,
    options?: DequeueOptions,
  ): Promise<ClaimedQueueJob[]> {
    const visibilityTimeoutMs =
      options?.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS;

    const claimedJobs: ClaimedQueueJob[] = [];

    for (let index = 0; index < maxJobs; index++) {
      const receipt = this.readyReceipts.shift();
      if (!receipt) break;

      const stored = this.jobs.get(receipt);
      if (!stored) continue;

      const claimedAtMs = Date.now();
      const visibleAtMs = claimedAtMs + visibilityTimeoutMs;
      const attempt = stored.attempt + 1;

      this.jobs.set(receipt, {
        ...stored,
        attempt,
      });
      this.inFlight.set(receipt, {
        claimedAtMs,
        visibleAtMs,
      });

      claimedJobs.push({
        ...stored.job,
        receipt,
        attempt,
        claimedAtMs,
        visibleAtMs,
      });
    }

    return claimedJobs;
  }

  async ack(receipt: string): Promise<boolean> {
    const wasInFlight = this.inFlight.delete(receipt);
    if (!wasInFlight) return false;

    this.jobs.delete(receipt);
    return true;
  }

  async requeueExpired(limit: number): Promise<number> {
    const now = Date.now();
    let moved = 0;

    for (const [receipt, state] of this.inFlight.entries()) {
      if (moved >= limit) break;
      if (state.visibleAtMs > now) continue;

      this.inFlight.delete(receipt);
      this.readyReceipts.push(receipt);
      moved += 1;
    }

    return moved;
  }

  async size(): Promise<number> {
    return this.readyReceipts.length;
  }

  async inFlightSize(): Promise<number> {
    return this.inFlight.size;
  }
}
