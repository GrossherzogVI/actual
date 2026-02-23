import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index] || 0;
}

type CleanupRedisClient = {
  connect: () => Promise<unknown>;
  del: (...keys: string[]) => Promise<number>;
  quit: () => Promise<void>;
};

const runIntegration =
  process.env.FINANCE_GATEWAY_RUN_INTEGRATION_PERF === 'true';
const databaseUrl = process.env.FINANCE_GATEWAY_INTEGRATION_DATABASE_URL;
const redisUrl = process.env.FINANCE_GATEWAY_INTEGRATION_REDIS_URL;

if (runIntegration && (!databaseUrl || !redisUrl)) {
  throw new Error(
    'FINANCE_GATEWAY_INTEGRATION_DATABASE_URL and FINANCE_GATEWAY_INTEGRATION_REDIS_URL are required when FINANCE_GATEWAY_RUN_INTEGRATION_PERF=true',
  );
}

const describeIntegration = runIntegration
  ? describe.sequential
  : describe.skip;

describeIntegration('fingerprint integration perf (postgres + redis)', () => {
  it('meets fingerprint claim contention and duplicate-skip p95 SLOs', async () => {
    const contentionRuns = envInt(
      'FINANCE_GATEWAY_INTEGRATION_CONTENTION_RUNS',
      200,
    );
    const duplicateRuns = envInt(
      'FINANCE_GATEWAY_INTEGRATION_DUPLICATE_RUNS',
      200,
    );
    const p95BudgetMs = envInt(
      'FINANCE_GATEWAY_INTEGRATION_P95_BUDGET_MS',
      250,
    );
    const staleRecoveryBudgetMs = envInt(
      'FINANCE_GATEWAY_INTEGRATION_STALE_RECOVERY_BUDGET_MS',
      250,
    );
    const minThroughputOpsPerSec = envInt(
      'FINANCE_GATEWAY_INTEGRATION_MIN_THROUGHPUT_OPS',
      25,
    );

    const runId = randomUUID().slice(0, 12);
    const queueKey = `financeos:gateway:jobs:int-perf:${runId}`;
    const contentionFingerprint = `fp-int-contended-${runId}`;
    const duplicateFingerprint = `fp-int-processed-${runId}`;
    const staleFingerprint = `fp-int-stale-${runId}`;
    const staleLeaseKey = `worker-fingerprint:${staleFingerprint}`;

    const [
      { RedisGatewayQueue },
      { PostgresGatewayRepository },
      { createGatewayService },
      { Pool },
      { createClient },
    ] = await Promise.all([
      import('../queue/redis-queue'),
      import('../repositories/postgres-repository'),
      import('../services/gateway-service'),
      import('pg'),
      import('redis'),
    ]);

    const repository = new PostgresGatewayRepository(
      new Pool({
        connectionString: databaseUrl,
        max: 10,
      }),
    );
    const queue = new RedisGatewayQueue(redisUrl!, queueKey);
    const cleanupClient = createClient({
      url: redisUrl,
    }) as unknown as CleanupRedisClient;

    await Promise.all([
      repository.init(),
      queue.init(),
      cleanupClient.connect(),
    ]);
    await cleanupClient.del(
      `${queueKey}:ready`,
      `${queueKey}:payload`,
      `${queueKey}:processing`,
    );

    const service = createGatewayService(repository, queue);
    const metricsBefore = await service.getRuntimeMetrics();

    try {
      const contentionStartedAt = Date.now();
      const contentionClaims = await Promise.all(
        Array.from({ length: contentionRuns }, async (_unused, index) => {
          const startedAt = Date.now();
          const claim = await service.claimWorkerJobFingerprint({
            workerId: `integration-contention-${index}`,
            fingerprint: contentionFingerprint,
            ttlMs: 60_000,
          });
          return {
            claim,
            durationMs: Date.now() - startedAt,
          };
        }),
      );
      const contentionDurationMs = Date.now() - contentionStartedAt;

      const contentionAcquired = contentionClaims.filter(
        entry => entry.claim.status === 'acquired',
      );
      const contentionAlreadyClaimed = contentionClaims.filter(
        entry => entry.claim.status === 'already-claimed',
      );

      expect(contentionAcquired.length).toBe(1);
      expect(contentionAlreadyClaimed.length).toBe(contentionRuns - 1);

      const contentionP95 = percentile(
        contentionClaims.map(entry => entry.durationMs),
        0.95,
      );
      expect(contentionP95).toBeLessThanOrEqual(p95BudgetMs);

      const contentionThroughput = Number(
        ((contentionRuns * 1000) / Math.max(1, contentionDurationMs)).toFixed(
          2,
        ),
      );
      expect(contentionThroughput).toBeGreaterThanOrEqual(
        minThroughputOpsPerSec,
      );

      const acquiredClaim = contentionAcquired[0];
      if (!acquiredClaim) {
        return;
      }

      await service.ackQueueJob({
        workerId: acquiredClaim.claim.ownerId,
        receipt: `integration-release-${runId}`,
        success: true,
        requeue: false,
        jobId: 'integration-release-job',
        jobName: 'integration-release-job',
        jobFingerprint: contentionFingerprint,
        attempt: 1,
        processingMs: 1,
        payload: {},
      });

      await repository.createWorkerJobAttempt({
        id: `attempt-${duplicateFingerprint}`,
        workerId: 'integration-processed-worker',
        jobId: 'integration-processed-job',
        jobName: 'integration-processed-job',
        jobFingerprint: duplicateFingerprint,
        receipt: `receipt-${duplicateFingerprint}`,
        attempt: 1,
        outcome: 'acked',
        processingMs: 1,
        payload: {},
        createdAtMs: Date.now(),
      });

      const duplicateStartedAt = Date.now();
      const duplicateClaims = await Promise.all(
        Array.from({ length: duplicateRuns }, async (_unused, index) => {
          const startedAt = Date.now();
          const claim = await service.claimWorkerJobFingerprint({
            workerId: `integration-duplicate-${index}`,
            fingerprint: duplicateFingerprint,
            ttlMs: 60_000,
          });
          return {
            claim,
            durationMs: Date.now() - startedAt,
          };
        }),
      );
      const duplicateDurationMs = Date.now() - duplicateStartedAt;

      expect(
        duplicateClaims.every(
          entry => entry.claim.status === 'already-processed',
        ),
      ).toBe(true);

      const duplicateP95 = percentile(
        duplicateClaims.map(entry => entry.durationMs),
        0.95,
      );
      expect(duplicateP95).toBeLessThanOrEqual(p95BudgetMs);

      const duplicateThroughput = Number(
        ((duplicateRuns * 1000) / Math.max(1, duplicateDurationMs)).toFixed(2),
      );
      expect(duplicateThroughput).toBeGreaterThanOrEqual(
        minThroughputOpsPerSec,
      );

      await repository.acquireSystemLease({
        leaseKey: staleLeaseKey,
        ownerId: 'integration-stale-owner-a',
        ttlMs: 1,
      });
      await new Promise(resolve => setTimeout(resolve, 5));

      const staleStartedAt = Date.now();
      const staleRecovery = await service.claimWorkerJobFingerprint({
        workerId: 'integration-stale-owner-b',
        fingerprint: staleFingerprint,
        ttlMs: 60_000,
      });
      const staleRecoveryDurationMs = Date.now() - staleStartedAt;

      expect(staleRecovery.status).toBe('acquired');
      expect(staleRecoveryDurationMs).toBeLessThanOrEqual(
        staleRecoveryBudgetMs,
      );

      const metricsAfter = await service.getRuntimeMetrics();
      expect(metricsAfter.workerFingerprintClaimEvents).toBeGreaterThan(
        metricsBefore.workerFingerprintClaimEvents,
      );
      expect(metricsAfter.workerFingerprintClaimAlreadyClaimed).toBeGreaterThan(
        metricsBefore.workerFingerprintClaimAlreadyClaimed,
      );
      expect(
        metricsAfter.workerFingerprintClaimAlreadyProcessed,
      ).toBeGreaterThan(metricsBefore.workerFingerprintClaimAlreadyProcessed);
      expect(metricsAfter.workerFingerprintStaleRecoveries).toBeGreaterThan(
        metricsBefore.workerFingerprintStaleRecoveries,
      );
    } finally {
      await Promise.allSettled([queue.close(), repository.close()]);
      await cleanupClient.del(
        `${queueKey}:ready`,
        `${queueKey}:payload`,
        `${queueKey}:processing`,
      );
      await cleanupClient.quit();
    }
  }, 120_000);
});
