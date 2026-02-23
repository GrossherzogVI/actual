export type QueueJob = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
};

export type ClaimedQueueJob = QueueJob & {
  receipt: string;
  attempt: number;
  claimedAtMs: number;
  visibleAtMs: number;
};

export type DequeueOptions = {
  visibilityTimeoutMs?: number;
};

export interface GatewayQueue {
  readonly kind: 'memory' | 'redis';

  init(): Promise<void>;
  close(): Promise<void>;

  enqueue(job: QueueJob): Promise<void>;
  dequeue(maxJobs: number, options?: DequeueOptions): Promise<ClaimedQueueJob[]>;
  ack(receipt: string): Promise<boolean>;
  requeueExpired(limit: number): Promise<number>;
  size(): Promise<number>;
  inFlightSize(): Promise<number>;
}
