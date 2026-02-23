import { describe, expect, it } from 'vitest';

import { InMemoryGatewayQueue } from '../queue/in-memory-queue';
import type { QueueJob } from '../queue/types';

describe('gateway queue reliability semantics', () => {
  function buildJob(id: string): QueueJob {
    return {
      id,
      name: 'workflow.test',
      payload: { id },
      createdAtMs: Date.now(),
    };
  }

  it('supports claim + ack and keeps in-flight accounting', async () => {
    const queue = new InMemoryGatewayQueue();
    await queue.init();

    await queue.enqueue(buildJob('job-1'));

    const claimed = await queue.dequeue(1, { visibilityTimeoutMs: 50 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.receipt).toBeTruthy();
    expect(claimed[0]?.attempt).toBe(1);

    expect(await queue.size()).toBe(0);
    expect(await queue.inFlightSize()).toBe(1);

    const acked = await queue.ack(claimed[0]!.receipt);
    expect(acked).toBe(true);
    expect(await queue.inFlightSize()).toBe(0);
  });

  it('requeues expired claims and increments attempt count', async () => {
    const queue = new InMemoryGatewayQueue();
    await queue.init();

    await queue.enqueue(buildJob('job-2'));

    const claimedOnce = await queue.dequeue(1, { visibilityTimeoutMs: 5 });
    expect(claimedOnce).toHaveLength(1);
    expect(claimedOnce[0]?.attempt).toBe(1);

    await new Promise(resolve => setTimeout(resolve, 10));

    const requeued = await queue.requeueExpired(10);
    expect(requeued).toBe(1);
    expect(await queue.size()).toBe(1);
    expect(await queue.inFlightSize()).toBe(0);

    const claimedTwice = await queue.dequeue(1, { visibilityTimeoutMs: 5 });
    expect(claimedTwice).toHaveLength(1);
    expect(claimedTwice[0]?.id).toBe('job-2');
    expect(claimedTwice[0]?.attempt).toBe(2);
  });

  it('supports nack with immediate requeue semantics', async () => {
    const queue = new InMemoryGatewayQueue();
    await queue.init();

    await queue.enqueue(buildJob('job-3'));

    const claimed = await queue.dequeue(1, { visibilityTimeoutMs: 5000 });
    expect(claimed).toHaveLength(1);
    expect(claimed[0]?.attempt).toBe(1);

    const requeued = await queue.nack(claimed[0]!.receipt, true);
    expect(requeued).toBe(true);
    expect(await queue.size()).toBe(1);
    expect(await queue.inFlightSize()).toBe(0);

    const claimedAgain = await queue.dequeue(1, { visibilityTimeoutMs: 5000 });
    expect(claimedAgain).toHaveLength(1);
    expect(claimedAgain[0]?.id).toBe('job-3');
    expect(claimedAgain[0]?.attempt).toBe(2);
  });

  it('supports nack drop semantics', async () => {
    const queue = new InMemoryGatewayQueue();
    await queue.init();

    await queue.enqueue(buildJob('job-4'));

    const claimed = await queue.dequeue(1, { visibilityTimeoutMs: 5000 });
    expect(claimed).toHaveLength(1);

    const dropped = await queue.nack(claimed[0]!.receipt, false);
    expect(dropped).toBe(true);
    expect(await queue.size()).toBe(0);
    expect(await queue.inFlightSize()).toBe(0);
  });
});
