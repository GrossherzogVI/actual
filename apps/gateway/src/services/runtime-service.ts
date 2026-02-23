import type { GatewayQueue } from '../queue/types';
import type { GatewayRepository } from '../repositories/types';
import type {
  LedgerEvent,
  OpsActivityEvent,
  QueueAckResult,
  QueueClaimResult,
  QueueRequeueExpiredResult,
  ReplayWorkerDeadLettersResult,
  WorkerDeadLetter,
  WorkerJobFingerprintClaimResult,
  WorkerQueueHealth,
  WorkerQueueLeaseResult,
} from '../types';

import {
  DEFAULT_QUEUE_VISIBILITY_TIMEOUT_MS,
  DEFAULT_WORKER_QUEUE_LEASE_KEY,
  nanoid,
  percentile,
  queueJob,
  safeRate,
  workerFingerprintLeaseKey,
} from './helpers';

export type RuntimeDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
};

export function createRuntimeService(
  repository: GatewayRepository,
  queue: GatewayQueue,
  deps: RuntimeDeps,
) {
  async function appendWorkerFingerprintClaimEvent(input: {
    workerId: string;
    fingerprint: string;
    leaseKey: string;
    status:
      | 'acquired'
      | 'already-processed'
      | 'already-claimed'
      | 'released'
      | 'release-miss';
    ttlMs: number;
    expiresAtMs?: number;
    staleRecovered?: boolean;
  }) {
    await repository.createWorkerFingerprintClaimEvent({
      id: nanoid(),
      workerId: input.workerId,
      fingerprint: input.fingerprint,
      leaseKey: input.leaseKey,
      status: input.status,
      ttlMs: Math.max(0, Math.trunc(input.ttlMs)),
      expiresAtMs: input.expiresAtMs,
      staleRecovered: input.staleRecovered === true,
      createdAtMs: Date.now(),
    });
  }

  async function learnCorrection(input: {
    input: Record<string, unknown>;
    correctOutput: Record<string, unknown>;
  }) {
    const correction = await repository.createCorrection({
      id: nanoid(),
      input: input.input,
      correctOutput: input.correctOutput,
      createdAtMs: Date.now(),
    });

    await queue.enqueue(
      queueJob('intelligence.correction.learned', {
        correctionId: correction.id,
      }),
    );

    return correction;
  }

  async function submitLedgerCommand(input: {
    workspaceId: string;
    actorId: string;
    commandType: string;
    aggregateId: string;
    aggregateType: string;
    payload: Record<string, unknown>;
  }): Promise<LedgerEvent> {
    const event: LedgerEvent = {
      eventId: nanoid(),
      workspaceId: input.workspaceId,
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      type: input.commandType,
      payload: input.payload,
      actorId: input.actorId,
      occurredAtMs: Date.now(),
      version: 0,
    };

    const committedEvent = await repository.appendLedgerEvent(event);
    await queue.enqueue(
      queueJob('ledger.command.submitted', {
        eventId: committedEvent.eventId,
        workspaceId: committedEvent.workspaceId,
        commandType: committedEvent.type,
        version: committedEvent.version,
      }),
    );

    return committedEvent;
  }

  async function streamLedgerEvents(input: {
    workspaceId: string;
    cursor?: string;
    limit: number;
  }) {
    return repository.streamLedgerEvents(input);
  }

  async function getProjectionSnapshot(input: {
    workspaceId: string;
    projectionName: string;
  }) {
    const state = await repository.getOpsState();
    const recentEvents = await repository.streamLedgerEvents({
      workspaceId: input.workspaceId,
      limit: 20,
    });

    return {
      snapshot: {
        projectionName: input.projectionName,
        pendingReviews: state.pendingReviews,
        urgentReviews: state.urgentReviews,
        expiringContracts: state.expiringContracts,
        recentEventCount: recentEvents.events.length,
      },
      generatedAtMs: Date.now(),
    };
  }

  async function claimQueueJobs(input?: {
    maxJobs?: number;
    visibilityTimeoutMs?: number;
  }): Promise<QueueClaimResult> {
    const maxJobs = Math.max(1, Math.min(input?.maxJobs ?? 25, 200));
    const visibilityTimeoutMs = Math.max(
      1_000,
      Math.min(
        input?.visibilityTimeoutMs ?? DEFAULT_QUEUE_VISIBILITY_TIMEOUT_MS,
        10 * 60 * 1000,
      ),
    );

    const jobs = await queue.dequeue(maxJobs, {
      visibilityTimeoutMs,
    });

    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    return {
      jobs,
      queueSize,
      queueInFlight,
    };
  }

  async function claimWorkerJobFingerprint(input: {
    workerId: string;
    fingerprint: string;
    ttlMs?: number;
  }): Promise<WorkerJobFingerprintClaimResult> {
    const fingerprint = input.fingerprint.trim();
    const ownerId = input.workerId;
    const ttlMs = Math.max(
      1_000,
      Math.min(
        input.ttlMs ?? DEFAULT_QUEUE_VISIBILITY_TIMEOUT_MS,
        10 * 60 * 1000,
      ),
    );
    const leaseKey = workerFingerprintLeaseKey(fingerprint);
    const now = Date.now();

    async function finalize(
      status: WorkerJobFingerprintClaimResult['status'],
      inputOverrides?: {
        expiresAtMs?: number;
        staleRecovered?: boolean;
      },
    ): Promise<WorkerJobFingerprintClaimResult> {
      await appendWorkerFingerprintClaimEvent({
        workerId: ownerId,
        fingerprint,
        leaseKey,
        status,
        ttlMs,
        expiresAtMs: inputOverrides?.expiresAtMs,
        staleRecovered: inputOverrides?.staleRecovered,
      });
      return {
        status,
        fingerprint,
        leaseKey,
        ownerId,
        ttlMs,
        expiresAtMs: inputOverrides?.expiresAtMs,
      };
    }

    if (fingerprint.length === 0) {
      return finalize('already-processed');
    }

    if (await repository.hasSuccessfulWorkerJobFingerprint(fingerprint)) {
      return finalize('already-processed');
    }

    const existingLease = await repository.getSystemLease({
      leaseKey,
    });
    const staleRecovered =
      !!existingLease &&
      existingLease.expiresAtMs <= now &&
      existingLease.ownerId !== ownerId;

    const acquired = await repository.acquireSystemLease({
      leaseKey,
      ownerId,
      ttlMs,
    });

    if (!acquired) {
      return finalize('already-claimed');
    }

    if (await repository.hasSuccessfulWorkerJobFingerprint(fingerprint)) {
      await repository.releaseSystemLease({
        leaseKey,
        ownerId,
      });
      return finalize('already-processed');
    }

    return finalize('acquired', {
      expiresAtMs: now + ttlMs,
      staleRecovered,
    });
  }

  async function ackQueueJob(input: {
    workerId: string;
    receipt: string;
    success?: boolean;
    requeue?: boolean;
    jobId?: string;
    jobName?: string;
    jobFingerprint?: string;
    attempt?: number;
    processingMs?: number;
    errorMessage?: string;
    payload?: Record<string, unknown>;
  }): Promise<QueueAckResult> {
    let acknowledged = false;
    let action: QueueAckResult['action'] = 'acked';

    if (input.success === false) {
      const requeue = input.requeue !== false;
      acknowledged = await queue.nack(input.receipt, requeue);
      action = requeue ? 'requeued' : 'dropped';
    } else {
      acknowledged = await queue.ack(input.receipt);
      action = 'acked';
    }

    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    const now = Date.now();
    const attemptRecordId = nanoid();
    await repository.createWorkerJobAttempt({
      id: attemptRecordId,
      workerId: input.workerId,
      jobId: input.jobId || 'unknown-job',
      jobName: input.jobName || 'unknown-job',
      jobFingerprint: input.jobFingerprint,
      receipt: input.receipt,
      attempt: Math.max(1, Math.trunc(input.attempt ?? 1)),
      outcome: acknowledged ? action : 'ack-miss',
      processingMs:
        typeof input.processingMs === 'number' &&
        Number.isFinite(input.processingMs) &&
        input.processingMs >= 0
          ? Math.trunc(input.processingMs)
          : undefined,
      errorMessage: input.errorMessage,
      payload: input.payload,
      createdAtMs: now,
    });

    if (acknowledged && action === 'dropped') {
      await repository.createWorkerDeadLetter({
        id: nanoid(),
        attemptId: attemptRecordId,
        workerId: input.workerId,
        jobId: input.jobId || 'unknown-job',
        jobName: input.jobName || 'unknown-job',
        receipt: input.receipt,
        attempt: Math.max(1, Math.trunc(input.attempt ?? 1)),
        status: 'open',
        replayCount: 0,
        errorMessage: input.errorMessage,
        payload: input.payload,
        createdAtMs: now,
      });
    }

    const fingerprintValue = input.jobFingerprint?.trim();
    if (fingerprintValue && fingerprintValue.length > 0) {
      const leaseKeyValue = workerFingerprintLeaseKey(fingerprintValue);
      try {
        const released = await repository.releaseSystemLease({
          leaseKey: leaseKeyValue,
          ownerId: input.workerId,
        });
        await appendWorkerFingerprintClaimEvent({
          workerId: input.workerId,
          fingerprint: fingerprintValue,
          leaseKey: leaseKeyValue,
          status: released ? 'released' : 'release-miss',
          ttlMs: 0,
        });
      } catch {
        // best-effort cleanup; lock expires automatically
        await appendWorkerFingerprintClaimEvent({
          workerId: input.workerId,
          fingerprint: fingerprintValue,
          leaseKey: leaseKeyValue,
          status: 'release-miss',
          ttlMs: 0,
        });
      }
    }

    return {
      acknowledged,
      action,
      queueSize,
      queueInFlight,
    };
  }

  async function requeueExpiredQueueJobs(input?: {
    limit?: number;
  }): Promise<QueueRequeueExpiredResult> {
    const limit = Math.max(1, Math.min(input?.limit ?? 100, 1000));
    const moved = await queue.requeueExpired(limit);
    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    return {
      moved,
      queueSize,
      queueInFlight,
    };
  }

  async function checkWorkerJobFingerprint(input: {
    fingerprint: string;
  }): Promise<{ alreadyProcessed: boolean }> {
    const fingerprint = input.fingerprint.trim();
    if (fingerprint.length === 0) {
      return {
        alreadyProcessed: false,
      };
    }

    const alreadyProcessed =
      await repository.hasSuccessfulWorkerJobFingerprint(fingerprint);
    return {
      alreadyProcessed,
    };
  }

  async function listWorkerDeadLetters(input?: {
    limit?: number;
    status?: WorkerDeadLetter['status'];
    workerId?: string;
    jobName?: string;
  }): Promise<WorkerDeadLetter[]> {
    const clamped = Math.max(1, Math.min(input?.limit ?? 50, 200));
    return repository.listWorkerDeadLetters(clamped, {
      status: input?.status,
      workerId: input?.workerId,
      jobName: input?.jobName,
    });
  }

  async function replayWorkerDeadLetters(input?: {
    deadLetterIds?: string[];
    limit?: number;
    maxAttempt?: number;
    jobName?: string;
    operatorId?: string;
  }): Promise<ReplayWorkerDeadLettersResult> {
    const limit = Math.max(1, Math.min(input?.limit ?? 20, 100));
    const maxAttempt = Math.max(1, Math.min(input?.maxAttempt ?? 6, 20));
    const operatorId = input?.operatorId || 'operator-replay';

    let candidates: WorkerDeadLetter[] = [];
    const notFound: string[] = [];

    if (input?.deadLetterIds && input.deadLetterIds.length > 0) {
      const deduped = [...new Set(input.deadLetterIds)].slice(0, limit);
      for (const deadLetterId of deduped) {
        const found = await repository.getWorkerDeadLetterById(deadLetterId);
        if (!found) {
          notFound.push(deadLetterId);
          continue;
        }
        candidates.push(found);
      }
    } else {
      candidates = await repository.listWorkerDeadLetters(limit, {
        status: 'open',
      });
    }

    if (input?.jobName) {
      candidates = candidates.filter(entry => entry.jobName === input.jobName);
    }

    let replayed = 0;
    let skipped = 0;

    for (const entry of candidates) {
      if (entry.status === 'resolved') {
        skipped += 1;
        continue;
      }
      if (entry.attempt >= maxAttempt) {
        skipped += 1;
        continue;
      }

      await queue.enqueue(queueJob(entry.jobName, entry.payload || {}));
      replayed += 1;

      await repository.createWorkerJobAttempt({
        id: nanoid(),
        workerId: operatorId,
        jobId: entry.jobId,
        jobName: entry.jobName,
        receipt: `replay:${entry.id}`,
        attempt: entry.attempt + 1,
        outcome: 'requeued',
        processingMs: 0,
        errorMessage: undefined,
        payload: entry.payload,
        createdAtMs: Date.now(),
      });

      await repository.updateWorkerDeadLetter({
        ...entry,
        status: 'replayed',
        replayCount: entry.replayCount + 1,
        lastReplayedAtMs: Date.now(),
      });
    }

    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    return {
      replayed,
      skipped,
      notFound,
      queueSize,
      queueInFlight,
    };
  }

  async function resolveWorkerDeadLetter(input: {
    deadLetterId: string;
    operatorId?: string;
    resolutionNote?: string;
  }): Promise<WorkerDeadLetter | null> {
    const existing = await repository.getWorkerDeadLetterById(
      input.deadLetterId,
    );
    if (!existing) {
      return null;
    }
    const resolvedAtMs = Date.now();
    const note = input.resolutionNote
      ? `${input.operatorId || 'operator'}: ${input.resolutionNote}`
      : undefined;
    return repository.updateWorkerDeadLetter({
      ...existing,
      status: 'resolved',
      resolvedAtMs,
      resolutionNote: note,
    });
  }

  async function reopenWorkerDeadLetter(input: {
    deadLetterId: string;
    operatorId?: string;
    note?: string;
  }): Promise<WorkerDeadLetter | null> {
    const existing = await repository.getWorkerDeadLetterById(
      input.deadLetterId,
    );
    if (!existing) {
      return null;
    }
    const note = input.note
      ? `${input.operatorId || 'operator'}: ${input.note}`
      : undefined;
    return repository.updateWorkerDeadLetter({
      ...existing,
      status: 'open',
      resolvedAtMs: undefined,
      resolutionNote: note,
    });
  }

  async function getWorkerQueueHealth(input?: {
    windowMs?: number;
    sampleLimit?: number;
    workerId?: string;
    jobName?: string;
  }): Promise<WorkerQueueHealth> {
    const windowMs = Math.max(
      60_000,
      Math.min(input?.windowMs ?? 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000),
    );
    const sampleLimit = Math.max(
      1,
      Math.min(input?.sampleLimit ?? 5000, 20_000),
    );
    const sinceMs = Date.now() - windowMs;

    const attempts = await repository.listWorkerJobAttempts(sampleLimit, {
      sinceMs,
      workerId: input?.workerId,
      jobName: input?.jobName,
    });

    const counts = {
      acked: 0,
      requeued: 0,
      dropped: 0,
      ackMiss: 0,
    };

    const processingSamples: number[] = [];

    for (const attempt of attempts) {
      if (attempt.outcome === 'acked') counts.acked += 1;
      else if (attempt.outcome === 'requeued') counts.requeued += 1;
      else if (attempt.outcome === 'dropped') counts.dropped += 1;
      else if (attempt.outcome === 'ack-miss') counts.ackMiss += 1;

      if (
        typeof attempt.processingMs === 'number' &&
        Number.isFinite(attempt.processingMs) &&
        attempt.processingMs >= 0
      ) {
        processingSamples.push(Math.trunc(attempt.processingMs));
      }
    }

    const sampleSize = attempts.length;
    const throughputPerMinute =
      windowMs > 0 ? Number(((sampleSize * 60_000) / windowMs).toFixed(2)) : 0;
    const failureCount = counts.dropped + counts.ackMiss;
    const failureRate =
      sampleSize > 0 ? Number((failureCount / sampleSize).toFixed(4)) : 0;
    const retryRate =
      sampleSize > 0 ? Number((counts.requeued / sampleSize).toFixed(4)) : 0;
    const deadLetterRate =
      sampleSize > 0 ? Number((counts.dropped / sampleSize).toFixed(4)) : 0;

    return {
      windowMs,
      sampleSize,
      generatedAtMs: Date.now(),
      counts,
      processingMs: {
        p50: percentile(processingSamples, 0.5),
        p95: percentile(processingSamples, 0.95),
        max: processingSamples.length > 0 ? Math.max(...processingSamples) : 0,
      },
      throughputPerMinute,
      failureRate,
      retryRate,
      deadLetterRate,
    };
  }

  async function acquireWorkerQueueLease(input: {
    workerId: string;
    ttlMs?: number;
    leaseKey?: string;
  }): Promise<WorkerQueueLeaseResult> {
    const ttlMs = Math.max(1_000, Math.min(input.ttlMs ?? 15_000, 300_000));
    const leaseKey = input.leaseKey || DEFAULT_WORKER_QUEUE_LEASE_KEY;
    const acquired = await repository.acquireSystemLease({
      leaseKey,
      ownerId: input.workerId,
      ttlMs,
    });
    const now = Date.now();
    return {
      acquired,
      leaseKey,
      ownerId: input.workerId,
      ttlMs,
      expiresAtMs: now + ttlMs,
    };
  }

  async function releaseWorkerQueueLease(input: {
    workerId: string;
    leaseKey?: string;
  }): Promise<{ released: boolean; leaseKey: string; ownerId: string }> {
    const leaseKey = input.leaseKey || DEFAULT_WORKER_QUEUE_LEASE_KEY;
    const released = await repository.releaseSystemLease({
      leaseKey,
      ownerId: input.workerId,
    });
    return {
      released,
      leaseKey,
      ownerId: input.workerId,
    };
  }

  async function getRuntimeMetrics() {
    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();
    const playbooks = await repository.listPlaybooks();
    const lanes = await repository.listDelegateLanes(1000);
    const corrections = await repository.listCorrections(1000);
    const branches = await repository.listScenarioBranches();
    const opsActivityEvents = await repository.countOpsActivityEvents();
    const workerJobAttempts = await repository.countWorkerJobAttempts();
    const workerDeadLetters = await repository.countWorkerDeadLetters();
    const [
      workerFingerprintClaimEvents,
      workerFingerprintClaimAcquired,
      workerFingerprintClaimAlreadyProcessed,
      workerFingerprintClaimAlreadyClaimed,
      workerFingerprintStaleRecoveries,
    ] = await Promise.all([
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['acquired', 'already-processed', 'already-claimed'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['acquired'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['already-processed'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['already-claimed'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['acquired'],
        staleRecovered: true,
      }),
    ]);
    const workerFingerprintDuplicateSkipRate = safeRate(
      workerFingerprintClaimAlreadyProcessed,
      workerFingerprintClaimEvents,
    );
    const workerFingerprintContentionRate = safeRate(
      workerFingerprintClaimAlreadyClaimed,
      workerFingerprintClaimEvents,
    );
    const workerFingerprintStaleRecoveryRate = safeRate(
      workerFingerprintStaleRecoveries,
      workerFingerprintClaimAcquired,
    );

    return {
      repositoryKind: repository.kind,
      queueKind: queue.kind,
      queueSize,
      queueInFlight,
      playbooks: playbooks.length,
      delegateLanes: lanes.length,
      corrections: corrections.length,
      scenarioBranches: branches.length,
      opsActivityEvents,
      workerJobAttempts,
      workerDeadLetters,
      workerFingerprintClaimEvents,
      workerFingerprintClaimAcquired,
      workerFingerprintClaimAlreadyProcessed,
      workerFingerprintClaimAlreadyClaimed,
      workerFingerprintStaleRecoveries,
      workerFingerprintDuplicateSkipRate,
      workerFingerprintContentionRate,
      workerFingerprintStaleRecoveryRate,
    };
  }

  return {
    learnCorrection,
    submitLedgerCommand,
    streamLedgerEvents,
    getProjectionSnapshot,
    claimQueueJobs,
    claimWorkerJobFingerprint,
    ackQueueJob,
    requeueExpiredQueueJobs,
    checkWorkerJobFingerprint,
    listWorkerDeadLetters,
    replayWorkerDeadLetters,
    resolveWorkerDeadLetter,
    reopenWorkerDeadLetter,
    getWorkerQueueHealth,
    acquireWorkerQueueLease,
    releaseWorkerQueueLease,
    getRuntimeMetrics,
  };
}
