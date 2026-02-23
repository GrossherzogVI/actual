import { createCommandEnvelope } from '@finance-os/domain-kernel';
import { describe, expect, it } from 'vitest';

import { InMemoryGatewayQueue } from '../queue/in-memory-queue';
import { InMemoryGatewayRepository } from '../repositories/in-memory-repository';
import { createGatewayService } from '../services/gateway-service';
import type { LedgerEvent } from '../types';

describe('gateway service contract behavior', () => {
  async function createHarness() {
    const repository = new InMemoryGatewayRepository();
    await repository.init();
    const queue = new InMemoryGatewayQueue();
    await queue.init();
    const service = createGatewayService(repository, queue);
    return { repository, queue, service };
  }

  it('creates and runs playbooks with queue side-effects', async () => {
    const { service, queue } = await createHarness();

    const created = await service.createPlaybook({
      name: 'Contract Test Playbook',
      description: 'test',
      commands: [{ verb: 'resolve-next-action' }],
    });

    expect(created.id).toBeTruthy();

    const run = await service.runPlaybook(created.id, {
      executionMode: 'dry-run',
    });
    expect(run).not.toBeNull();
    expect(run?.executedSteps).toBe(1);

    const queued = await queue.dequeue(10);
    expect(queued.some(job => job.name === 'workflow.playbook.created')).toBe(true);
    expect(queued.some(job => job.name === 'workflow.playbook.run')).toBe(true);
    expect(
      queued.some(
        job =>
          job.name === 'autopilot-run-started' &&
          job.payload.scope === 'playbook' &&
          job.payload.runId === run?.id,
      ),
    ).toBe(true);
    expect(
      queued.some(
        job =>
          job.name === 'autopilot-run-completed' &&
          job.payload.scope === 'playbook' &&
          job.payload.runId === run?.id,
      ),
    ).toBe(true);
  });

  it('supports queue claim + ack + nack requeue lifecycle through service API', async () => {
    const { service } = await createHarness();

    const seededPlaybook = await service.createPlaybook({
      name: 'Queue Lifecycle Playbook',
      description: 'queue lifecycle',
      commands: [{ verb: 'resolve-next-action' }],
    });
    await service.runPlaybook(
      seededPlaybook.id,
      { executionMode: 'dry-run' },
      'owner',
      'queue-test',
    );

    const claimed = await service.claimQueueJobs({
      maxJobs: 5,
      visibilityTimeoutMs: 10_000,
    });
    expect(claimed.jobs.length).toBeGreaterThan(0);
    expect(claimed.jobs.every(job => typeof job.receipt === 'string')).toBe(true);

    const first = claimed.jobs[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }

    const requeued = await service.ackQueueJob({
      workerId: 'worker-a',
      receipt: first.receipt,
      success: false,
      requeue: true,
      jobId: first.id,
      jobName: first.name,
      attempt: first.attempt,
      processingMs: 3,
      errorMessage: 'retry',
      payload: first.payload,
    });
    expect(requeued.acknowledged).toBe(true);
    expect(requeued.action).toBe('requeued');

    const claimedAgain = await service.claimQueueJobs({
      maxJobs: 10,
      visibilityTimeoutMs: 10_000,
    });
    const sameJob = claimedAgain.jobs.find(job => job.id === first.id);
    expect(sameJob?.attempt).toBeGreaterThanOrEqual(2);

    if (sameJob) {
      const dropped = await service.ackQueueJob({
        workerId: 'worker-a',
        receipt: sameJob.receipt,
        success: false,
        requeue: false,
        jobId: sameJob.id,
        jobName: sameJob.name,
        attempt: sameJob.attempt,
        processingMs: 5,
        errorMessage: 'forced drop',
        payload: sameJob.payload,
      });
      expect(dropped.acknowledged).toBe(true);
      expect(dropped.action).toBe('dropped');
    }

    for (const job of claimedAgain.jobs) {
      if (sameJob && job.receipt === sameJob.receipt) continue;
      await service.ackQueueJob({
        workerId: 'worker-a',
        receipt: job.receipt,
        success: true,
        jobId: job.id,
        jobName: job.name,
        attempt: job.attempt,
        processingMs: 1,
        payload: job.payload,
      });
    }

    const deadLetters = await service.listWorkerDeadLetters({ limit: 20 });
    expect(deadLetters.length).toBeGreaterThanOrEqual(1);
    expect(deadLetters[0]?.workerId).toBe('worker-a');

    const runtime = await service.getRuntimeMetrics();
    expect(runtime.workerJobAttempts).toBeGreaterThanOrEqual(2);
    expect(runtime.workerDeadLetters).toBeGreaterThanOrEqual(1);
  });

  it('tracks successful worker fingerprints for duplicate suppression checks', async () => {
    const { service } = await createHarness();

    const playbook = await service.createPlaybook({
      name: 'Fingerprint Playbook',
      description: 'fingerprint checks',
      commands: [{ verb: 'resolve-next-action' }],
    });
    await service.runPlaybook(
      playbook.id,
      { executionMode: 'dry-run' },
      'owner',
      'fingerprint-test',
    );

    const claimed = await service.claimQueueJobs({
      maxJobs: 10,
      visibilityTimeoutMs: 10_000,
    });
    expect(claimed.jobs.length).toBeGreaterThan(1);
    const droppedCandidate = claimed.jobs[0];
    const successCandidate = claimed.jobs[1];
    expect(droppedCandidate).toBeDefined();
    expect(successCandidate).toBeDefined();
    if (!droppedCandidate || !successCandidate) {
      return;
    }

    await service.ackQueueJob({
      workerId: 'worker-fingerprint',
      receipt: droppedCandidate.receipt,
      success: false,
      requeue: false,
      jobId: droppedCandidate.id,
      jobName: droppedCandidate.name,
      jobFingerprint: 'fp-drop',
      attempt: droppedCandidate.attempt,
      processingMs: 2,
      errorMessage: 'dropped',
      payload: droppedCandidate.payload,
    });

    const droppedCheck = await service.checkWorkerJobFingerprint({
      fingerprint: 'fp-drop',
    });
    expect(droppedCheck.alreadyProcessed).toBe(false);

    await service.ackQueueJob({
      workerId: 'worker-fingerprint',
      receipt: successCandidate.receipt,
      success: true,
      requeue: false,
      jobId: successCandidate.id,
      jobName: successCandidate.name,
      jobFingerprint: 'fp-acked',
      attempt: successCandidate.attempt,
      processingMs: 1,
      payload: successCandidate.payload,
    });

    const ackedCheck = await service.checkWorkerJobFingerprint({
      fingerprint: 'fp-acked',
    });
    expect(ackedCheck.alreadyProcessed).toBe(true);

    const processedClaim = await service.claimWorkerJobFingerprint({
      workerId: 'worker-fingerprint-claim',
      fingerprint: 'fp-acked',
      ttlMs: 5_000,
    });
    expect(processedClaim.status).toBe('already-processed');
  });

  it('enforces atomic fingerprint claim ownership and releases on ack cleanup', async () => {
    const { service } = await createHarness();

    const first = await service.claimWorkerJobFingerprint({
      workerId: 'worker-lock-a',
      fingerprint: 'fp-lock-test',
      ttlMs: 10_000,
    });
    expect(first.status).toBe('acquired');

    const second = await service.claimWorkerJobFingerprint({
      workerId: 'worker-lock-b',
      fingerprint: 'fp-lock-test',
      ttlMs: 10_000,
    });
    expect(second.status).toBe('already-claimed');

    await service.ackQueueJob({
      workerId: 'worker-lock-a',
      receipt: 'non-existent-receipt',
      success: true,
      requeue: false,
      jobId: 'job-lock-test',
      jobName: 'job-lock-test',
      jobFingerprint: 'fp-lock-test',
      attempt: 1,
      processingMs: 1,
      payload: {},
    });

    const third = await service.claimWorkerJobFingerprint({
      workerId: 'worker-lock-b',
      fingerprint: 'fp-lock-test',
      ttlMs: 10_000,
    });
    expect(third.status).toBe('acquired');
  });

  it('allows only one concurrent fingerprint claim and recovers after release', async () => {
    const { service } = await createHarness();

    const claims = await Promise.all([
      service.claimWorkerJobFingerprint({
        workerId: 'worker-concurrent-a',
        fingerprint: 'fp-concurrent-test',
        ttlMs: 10_000,
      }),
      service.claimWorkerJobFingerprint({
        workerId: 'worker-concurrent-b',
        fingerprint: 'fp-concurrent-test',
        ttlMs: 10_000,
      }),
      service.claimWorkerJobFingerprint({
        workerId: 'worker-concurrent-c',
        fingerprint: 'fp-concurrent-test',
        ttlMs: 10_000,
      }),
    ]);

    const acquired = claims.filter(claim => claim.status === 'acquired');
    const alreadyClaimed = claims.filter(claim => claim.status === 'already-claimed');

    expect(acquired.length).toBe(1);
    expect(alreadyClaimed.length).toBe(2);

    const ownerId = acquired[0]?.ownerId;
    expect(typeof ownerId).toBe('string');
    if (!ownerId) {
      return;
    }

    await service.ackQueueJob({
      workerId: ownerId,
      receipt: 'non-existent-receipt-concurrent',
      success: true,
      requeue: false,
      jobId: 'job-concurrent-test',
      jobName: 'job-concurrent-test',
      jobFingerprint: 'fp-concurrent-test',
      attempt: 1,
      processingMs: 1,
      payload: {},
    });

    const reclaimed = await service.claimWorkerJobFingerprint({
      workerId: 'worker-concurrent-z',
      fingerprint: 'fp-concurrent-test',
      ttlMs: 10_000,
    });
    expect(reclaimed.status).toBe('acquired');
  });

  it('reports fingerprint contention, duplicate skips, and stale lock recoveries in runtime metrics', async () => {
    const { service, repository } = await createHarness();

    const first = await service.claimWorkerJobFingerprint({
      workerId: 'worker-metrics-a',
      fingerprint: 'fp-metrics-contended',
      ttlMs: 5_000,
    });
    expect(first.status).toBe('acquired');

    const contended = await service.claimWorkerJobFingerprint({
      workerId: 'worker-metrics-b',
      fingerprint: 'fp-metrics-contended',
      ttlMs: 5_000,
    });
    expect(contended.status).toBe('already-claimed');

    await repository.acquireSystemLease({
      leaseKey: 'worker-fingerprint:fp-metrics-stale',
      ownerId: 'worker-metrics-stale-a',
      ttlMs: 1,
    });
    await new Promise(resolve => setTimeout(resolve, 5));

    const staleRecovered = await service.claimWorkerJobFingerprint({
      workerId: 'worker-metrics-b',
      fingerprint: 'fp-metrics-stale',
      ttlMs: 5_000,
    });
    expect(staleRecovered.status).toBe('acquired');

    await repository.createWorkerJobAttempt({
      id: 'attempt-metrics-duplicate',
      workerId: 'worker-metrics-b',
      jobId: 'metrics-job',
      jobName: 'metrics-job',
      jobFingerprint: 'fp-metrics-duplicate',
      receipt: 'metrics-success-receipt',
      attempt: 1,
      outcome: 'acked',
      processingMs: 1,
      payload: {},
      createdAtMs: Date.now(),
    });

    const duplicateSkip = await service.claimWorkerJobFingerprint({
      workerId: 'worker-metrics-c',
      fingerprint: 'fp-metrics-duplicate',
      ttlMs: 5_000,
    });
    expect(duplicateSkip.status).toBe('already-processed');

    const metrics = await service.getRuntimeMetrics();
    expect(metrics.workerFingerprintClaimEvents).toBeGreaterThanOrEqual(4);
    expect(metrics.workerFingerprintClaimAcquired).toBeGreaterThanOrEqual(2);
    expect(metrics.workerFingerprintClaimAlreadyClaimed).toBeGreaterThanOrEqual(1);
    expect(metrics.workerFingerprintClaimAlreadyProcessed).toBeGreaterThanOrEqual(1);
    expect(metrics.workerFingerprintStaleRecoveries).toBeGreaterThanOrEqual(1);
    expect(metrics.workerFingerprintDuplicateSkipRate).toBeGreaterThan(0);
    expect(metrics.workerFingerprintContentionRate).toBeGreaterThan(0);
    expect(metrics.workerFingerprintStaleRecoveryRate).toBeGreaterThan(0);
  });

  it('replays dead letters with attempt-cap safeguards and reports queue health', async () => {
    const { service } = await createHarness();

    const playbook = await service.createPlaybook({
      name: 'Replay Candidate Playbook',
      description: 'dead-letter replay test',
      commands: [{ verb: 'resolve-next-action' }],
    });
    await service.runPlaybook(
      playbook.id,
      { executionMode: 'dry-run' },
      'owner',
      'queue-health-test',
    );

    const claimed = await service.claimQueueJobs({
      maxJobs: 5,
      visibilityTimeoutMs: 5_000,
    });
    expect(claimed.jobs.length).toBeGreaterThan(0);
    const candidate = claimed.jobs[0];
    expect(candidate).toBeDefined();
    if (!candidate) {
      return;
    }

    const dropped = await service.ackQueueJob({
      workerId: 'worker-replay-test',
      receipt: candidate.receipt,
      success: false,
      requeue: false,
      jobId: candidate.id,
      jobName: candidate.name,
      attempt: 8,
      processingMs: 4,
      errorMessage: 'forced dead letter',
      payload: candidate.payload,
    });
    expect(dropped.acknowledged).toBe(true);
    expect(dropped.action).toBe('dropped');

    const cappedReplay = await service.replayWorkerDeadLetters({
      limit: 10,
      maxAttempt: 6,
    });
    expect(cappedReplay.replayed).toBe(0);
    expect(cappedReplay.skipped).toBeGreaterThanOrEqual(1);

    const replayed = await service.replayWorkerDeadLetters({
      limit: 10,
      maxAttempt: 10,
      operatorId: 'operator-replay-test',
    });
    expect(replayed.replayed).toBeGreaterThanOrEqual(1);

    const queueHealth = await service.getWorkerQueueHealth({
      windowMs: 60 * 60 * 1000,
      sampleLimit: 500,
    });
    expect(queueHealth.sampleSize).toBeGreaterThan(0);
    expect(queueHealth.counts.dropped).toBeGreaterThanOrEqual(1);
    expect(queueHealth.retryRate).toBeGreaterThanOrEqual(0);
    expect(queueHealth.processingMs.p95).toBeGreaterThanOrEqual(0);
  });

  it('supports dead-letter resolve and reopen lifecycle transitions', async () => {
    const { service } = await createHarness();

    const playbook = await service.createPlaybook({
      name: 'Dead Letter Lifecycle Playbook',
      description: 'dead letter lifecycle',
      commands: [{ verb: 'resolve-next-action' }],
    });
    await service.runPlaybook(
      playbook.id,
      { executionMode: 'dry-run' },
      'owner',
      'dead-letter-lifecycle',
    );

    const claimed = await service.claimQueueJobs({
      maxJobs: 5,
      visibilityTimeoutMs: 5_000,
    });
    const candidate = claimed.jobs[0];
    expect(candidate).toBeDefined();
    if (!candidate) {
      return;
    }

    await service.ackQueueJob({
      workerId: 'worker-lifecycle',
      receipt: candidate.receipt,
      success: false,
      requeue: false,
      jobId: candidate.id,
      jobName: candidate.name,
      attempt: candidate.attempt,
      processingMs: 7,
      errorMessage: 'lifecycle-test-drop',
      payload: candidate.payload,
    });

    const openEntries = await service.listWorkerDeadLetters({
      limit: 20,
      status: 'open',
    });
    expect(openEntries.length).toBeGreaterThan(0);
    const target = openEntries[0];
    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    const resolved = await service.resolveWorkerDeadLetter({
      deadLetterId: target.id,
      operatorId: 'ops-user',
      resolutionNote: 'manually inspected',
    });
    expect(resolved?.status).toBe('resolved');

    const resolvedOnly = await service.listWorkerDeadLetters({
      limit: 20,
      status: 'resolved',
    });
    expect(resolvedOnly.some(entry => entry.id === target.id)).toBe(true);

    const reopened = await service.reopenWorkerDeadLetter({
      deadLetterId: target.id,
      operatorId: 'ops-user',
      note: 'needs replay',
    });
    expect(reopened?.status).toBe('open');

    const openAgain = await service.listWorkerDeadLetters({
      limit: 20,
      status: 'open',
    });
    expect(openAgain.some(entry => entry.id === target.id)).toBe(true);
  });

  it('enforces single-owner worker queue lease fencing via service API', async () => {
    const { service } = await createHarness();

    const first = await service.acquireWorkerQueueLease({
      workerId: 'worker-a',
      ttlMs: 30_000,
    });
    expect(first.acquired).toBe(true);

    const second = await service.acquireWorkerQueueLease({
      workerId: 'worker-b',
      ttlMs: 30_000,
    });
    expect(second.acquired).toBe(false);

    const wrongRelease = await service.releaseWorkerQueueLease({
      workerId: 'worker-b',
    });
    expect(wrongRelease.released).toBe(false);

    const correctRelease = await service.releaseWorkerQueueLease({
      workerId: 'worker-a',
    });
    expect(correctRelease.released).toBe(true);

    const third = await service.acquireWorkerQueueLease({
      workerId: 'worker-b',
      ttlMs: 30_000,
    });
    expect(third.acquired).toBe(true);
  });

  it('lists and replays playbook runs', async () => {
    const { service } = await createHarness();

    const playbook = await service.createPlaybook({
      name: 'Replayable Playbook',
      description: 'for replay tests',
      commands: [{ verb: 'resolve-next-action' }, { verb: 'refresh-command-center' }],
    });

    const first = await service.runPlaybook(
      playbook.id,
      { executionMode: 'dry-run' },
      'owner',
      'finance-os-web',
    );
    expect(first).not.toBeNull();

    const history = await service.listPlaybookRuns(10, {
      playbookId: playbook.id,
      executionMode: 'dry-run',
    });
    expect(history.some(run => run.id === first?.id)).toBe(true);

    const replayed = await service.replayPlaybookRun({
      runId: first?.id || 'missing',
      executionMode: 'live',
      actorId: 'owner',
      sourceSurface: 'finance-os-web',
    });
    expect(replayed).not.toBeNull();
    expect(replayed?.executionMode).toBe('live');
    expect(replayed?.chain.length).toBeGreaterThan(0);
  });

  it('applies batch policy and decreases pending reviews', async () => {
    const { service, repository } = await createHarness();
    const before = await repository.getOpsState();

    const result = await service.applyBatchPolicy(['a', 'b'], 'accepted', 'batch');
    expect(result.updatedCount).toBeGreaterThanOrEqual(0);

    const after = await repository.getOpsState();
    expect(after.pendingReviews).toBeLessThanOrEqual(before.pendingReviews);
  });

  it('lists close runs with filters', async () => {
    const { service } = await createHarness();
    await service.runCloseRoutine('weekly');
    await service.runCloseRoutine('monthly');

    const weekly = await service.listCloseRuns(20, { period: 'weekly' });
    expect(weekly.every(run => run.period === 'weekly')).toBe(true);

    const withExceptions = await service.listCloseRuns(20, { hasExceptions: true });
    expect(withExceptions.every(run => run.exceptionCount > 0)).toBe(true);
  });

  it('executes command chains with merged pair semantics', async () => {
    const { service, queue } = await createHarness();

    const run = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly -> open-review',
      assignee: 'delegate',
      options: {
        executionMode: 'live',
        guardrailProfile: 'strict',
        rollbackOnFailure: false,
      },
    });

    expect(run.steps).toHaveLength(2);
    expect(run.steps[0]).toMatchObject({
      raw: 'close -> weekly',
      status: 'ok',
    });
    expect(run.steps[1]).toMatchObject({
      raw: 'open-review',
      status: 'ok',
      route: '/review?priority=urgent',
    });
    expect(run.errorCount).toBe(0);
    expect(run.statusTimeline.map(transition => transition.status)).toEqual([
      'planned',
      'running',
      'completed',
    ]);

    const queued = await queue.dequeue(10);
    expect(queued.filter(job => job.name === 'workflow.close.run')).toHaveLength(1);
  });

  it('stores command chain runs for audit retrieval', async () => {
    const { service } = await createHarness();

    const firstRun = await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
    });
    const secondRun = await service.executeWorkflowCommandChain({
      chain: 'close -> monthly',
    });

    const recentRuns = await service.listWorkflowCommandRuns(10);
    expect(recentRuns.length).toBeGreaterThanOrEqual(2);
    expect(recentRuns[0]?.executedAtMs).toBeGreaterThanOrEqual(
      recentRuns[1]?.executedAtMs || 0,
    );
    expect(recentRuns.some(run => run.id === firstRun.id)).toBe(true);
    expect(recentRuns.some(run => run.id === secondRun.id)).toBe(true);
    expect(recentRuns.every(run => typeof run.actorId === 'string')).toBe(true);
    expect(recentRuns.every(run => typeof run.sourceSurface === 'string')).toBe(true);
  });

  it('adapts focus scores based on recent action outcomes', async () => {
    const { service } = await createHarness();

    const before = await service.getAdaptiveFocusPanel();
    const urgentBefore =
      before.actions.find(action => action.id === 'focus-urgent-review')?.score || 0;

    await service.recordActionOutcome({
      actionId: 'focus-urgent-review',
      outcome: 'accepted',
      notes: 'completed',
    });

    const after = await service.getAdaptiveFocusPanel();
    const urgentAfter =
      after.actions.find(action => action.id === 'focus-urgent-review')?.score || 0;

    expect(urgentAfter).toBeLessThanOrEqual(urgentBefore);
  });

  it('builds narrative pulse summary with highlights and actions', async () => {
    const { service } = await createHarness();
    const pulse = await service.getNarrativePulse();

    expect(typeof pulse.summary).toBe('string');
    expect(pulse.highlights.length).toBeGreaterThan(0);
    expect(Array.isArray(pulse.actionHints)).toBe(true);
  });

  it('aggregates ops activity across workflow, focus, delegate, and scenario planes', async () => {
    const { service } = await createHarness();
    const playbookId = (await service.listPlaybooks())[0]?.id;
    expect(playbookId).toBeTruthy();
    if (!playbookId) {
      return;
    }

    await service.runPlaybook(
      playbookId,
      { executionMode: 'dry-run' },
      'owner',
      'finance-os-web',
    );
    await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
      actorId: 'owner',
      sourceSurface: 'finance-os-web',
      options: {
        executionMode: 'live',
      },
    });
    await service.executeWorkflowCommandChain({
      chain: 'unknown-command-token',
      actorId: 'owner',
      sourceSurface: 'finance-os-web',
      options: {
        executionMode: 'live',
      },
    });
    await service.runCloseRoutine('weekly');
    await service.recordActionOutcome({
      actionId: 'focus-urgent-review',
      outcome: 'accepted',
      notes: 'processed queue',
    });
    await service.assignDelegateLane({
      title: 'Follow-up with insurance provider',
      assignee: 'delegate',
      assignedBy: 'owner',
      actorId: 'owner',
      priority: 'high',
      payload: {
        source: 'contract-test',
      },
    });
    await service.setEgressPolicy({
      allowCloud: false,
      allowedProviders: ['openai'],
      redactionMode: 'balanced',
    });

    const branch = await service.createScenarioBranch({
      name: 'Adoption Candidate',
    });
    await service.applyScenarioMutation({
      branchId: branch.id,
      mutationKind: 'cashflow-adjustment',
      payload: {
        amountDelta: 120,
        riskDelta: 1,
      },
    });
    const adopted = await service.adoptScenarioBranch({
      branchId: branch.id,
      force: true,
    });
    expect(adopted.ok).toBe(true);

    const firstPage = await service.listOpsActivity({
      limit: 3,
    });
    expect(firstPage.events.length).toBe(3);
    expect(
      firstPage.events.every((event, index) => {
        if (index === 0) {
          return true;
        }
        const previous = firstPage.events[index - 1]!;
        return (
          event.createdAtMs < previous.createdAtMs ||
          (event.createdAtMs === previous.createdAtMs && event.id < previous.id)
        );
      }),
    ).toBe(true);
    expect(typeof firstPage.nextCursor).toBe('string');

    const secondPage = await service.listOpsActivity({
      limit: 3,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.events.length).toBeGreaterThan(0);

    const firstIds = new Set(firstPage.events.map(event => event.id));
    expect(secondPage.events.some(event => firstIds.has(event.id))).toBe(false);

    const events = await service.listOpsActivity({
      limit: 80,
    });
    expect(events.events.length).toBeGreaterThan(0);
    expect(
      events.events.every((event, index) => {
        if (index === 0) {
          return true;
        }
        const previous = events.events[index - 1]!;
        return (
          event.createdAtMs < previous.createdAtMs ||
          (event.createdAtMs === previous.createdAtMs && event.id < previous.id)
        );
      }),
    ).toBe(true);
    expect(events.events.some(event => event.kind === 'workflow-command-run')).toBe(
      true,
    );
    expect(events.events.some(event => event.kind === 'workflow-playbook-run')).toBe(
      true,
    );
    expect(events.events.some(event => event.kind === 'workflow-close-run')).toBe(
      true,
    );
    expect(events.events.some(event => event.kind === 'focus-action-outcome')).toBe(
      true,
    );
    expect(events.events.some(event => event.kind === 'scenario-adoption')).toBe(
      true,
    );
    expect(events.events.some(event => event.kind === 'delegate-lane')).toBe(true);
    expect(events.events.some(event => event.kind === 'policy-egress')).toBe(true);

    const delegateOnly = await service.listOpsActivity({
      limit: 20,
      kinds: ['delegate-lane'],
    });
    expect(delegateOnly.events.length).toBeGreaterThan(0);
    expect(delegateOnly.events.every(event => event.kind === 'delegate-lane')).toBe(
      true,
    );

    const criticalOnly = await service.listOpsActivity({
      limit: 20,
      severities: ['critical'],
    });
    expect(criticalOnly.events.length).toBeGreaterThan(0);
    expect(criticalOnly.events.every(event => event.severity === 'critical')).toBe(
      true,
    );
  });

  it('backfills and trims materialized ops activity events', async () => {
    const { service, repository } = await createHarness();

    const before = await service.getRuntimeMetrics();
    expect(before.opsActivityEvents).toBe(0);

    await repository.createWorkerJobAttempt({
      id: 'attempt-maint-1',
      workerId: 'worker-maint',
      jobId: 'job-maint-1',
      jobName: 'workflow.close.run',
      receipt: 'receipt-maint-1',
      attempt: 1,
      outcome: 'dropped',
      processingMs: 10,
      errorMessage: 'drop one',
      payload: { test: 1 },
      createdAtMs: Date.now() - 2_000,
    });
    await repository.createWorkerJobAttempt({
      id: 'attempt-maint-2',
      workerId: 'worker-maint',
      jobId: 'job-maint-2',
      jobName: 'workflow.close.run',
      receipt: 'receipt-maint-2',
      attempt: 1,
      outcome: 'acked',
      processingMs: 12,
      payload: { test: 2 },
      createdAtMs: Date.now() - 1_000,
    });
    await repository.createWorkerDeadLetter({
      id: 'dead-maint-1',
      attemptId: 'attempt-maint-1',
      workerId: 'worker-maint',
      jobId: 'job-maint-1',
      jobName: 'workflow.close.run',
      receipt: 'receipt-maint-1',
      attempt: 1,
      status: 'open',
      replayCount: 0,
      errorMessage: 'drop one',
      payload: { test: 1 },
      createdAtMs: Date.now() - 2_000,
    });
    await repository.createWorkerDeadLetter({
      id: 'dead-maint-2',
      attemptId: 'attempt-maint-2',
      workerId: 'worker-maint',
      jobId: 'job-maint-2',
      jobName: 'workflow.close.run',
      receipt: 'receipt-maint-2',
      attempt: 1,
      status: 'open',
      replayCount: 0,
      errorMessage: 'drop two',
      payload: { test: 2 },
      createdAtMs: Date.now() - 1_000,
    });

    const firstBackfill = await service.backfillOpsActivity({ limitPerPlane: 200 });
    const afterFirst = await service.getRuntimeMetrics();

    expect(firstBackfill.attempted).toBeGreaterThan(0);
    expect(afterFirst.opsActivityEvents).toBeGreaterThan(0);

    const secondBackfill = await service.backfillOpsActivity({ limitPerPlane: 200 });
    const afterSecond = await service.getRuntimeMetrics();

    expect(secondBackfill.attempted).toBeGreaterThan(0);
    expect(afterSecond.opsActivityEvents).toBe(afterFirst.opsActivityEvents);

    const maintenance = await service.runOpsActivityMaintenance({
      retentionDays: 365,
      maxRows: 1,
    });
    const afterMaintenance = await service.getRuntimeMetrics();

    expect(maintenance.total).toBeLessThanOrEqual(1);
    expect(maintenance.totalWorkerJobAttempts).toBeLessThanOrEqual(1);
    expect(maintenance.totalWorkerDeadLetters).toBeLessThanOrEqual(1);
    expect(afterMaintenance.opsActivityEvents).toBeLessThanOrEqual(1);
    expect(afterMaintenance.workerJobAttempts).toBeLessThanOrEqual(1);
    expect(afterMaintenance.workerDeadLetters).toBeLessThanOrEqual(1);
  });

  it('runs async ops activity pipeline with visible status transitions', async () => {
    const { service } = await createHarness();

    const initialStatus = await service.getOpsActivityPipelineStatus();
    expect(initialStatus.orchestrator.runCount).toBe(0);

    const started = await service.startOpsActivityPipeline({
      waitForCompletion: false,
      runBackfill: true,
      runMaintenance: true,
      limitPerPlane: 200,
      retentionDays: 365,
      maxRows: 50000,
    });
    expect(started.started).toBe(true);

    const secondAttempt = await service.startOpsActivityPipeline({
      waitForCompletion: false,
    });
    expect(secondAttempt.started).toBe(false);

    let status = await service.getOpsActivityPipelineStatus();
    for (let index = 0; index < 40 && status.orchestrator.running; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
      status = await service.getOpsActivityPipelineStatus();
    }

    expect(status.orchestrator.running).toBe(false);
    expect(status.orchestrator.runCount).toBeGreaterThanOrEqual(1);
    expect(status.backfill.runCount).toBeGreaterThanOrEqual(1);
    expect(status.maintenance.runCount).toBeGreaterThanOrEqual(1);
    expect(status.orchestrator.lastError).toBeUndefined();
  });

  it('checks scenario adoption risk, exposes lineage, and supports force adopt', async () => {
    const { service } = await createHarness();

    const root = await service.createScenarioBranch({
      name: 'Root Scenario',
    });
    const child = await service.createScenarioBranch({
      name: 'Risky Child',
      baseBranchId: root.id,
    });

    await service.applyScenarioMutation({
      branchId: child.id,
      mutationKind: 'manual-adjustment',
      payload: {
        amountDelta: -2500,
        riskDelta: 12,
      },
    });

    const lineage = await service.getScenarioLineage(child.id);
    expect(lineage?.nodes.map(node => node.branchId)).toEqual([root.id, child.id]);

    const check = await service.getScenarioAdoptionCheck({
      branchId: child.id,
      againstBranchId: root.id,
    });
    expect(check?.canAdopt).toBe(false);
    expect((check?.blockers || []).length).toBeGreaterThan(0);

    const blocked = await service.adoptScenarioBranch({
      branchId: child.id,
    });
    expect(blocked).toMatchObject({
      ok: false,
      error: 'adoption-blocked',
    });

    const forced = await service.adoptScenarioBranch({
      branchId: child.id,
      force: true,
    });
    expect(forced.ok).toBe(true);
  });

  it('filters command runs by actor, surface, mode, and error state', async () => {
    const { service } = await createHarness();

    const delegateDryRun = await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
      actorId: 'delegate',
      sourceSurface: 'desktop-client',
      options: {
        executionMode: 'dry-run',
      },
    });

    const ownerLive = await service.executeWorkflowCommandChain({
      chain: 'open-review',
      actorId: 'owner',
      sourceSurface: 'finance-os-web',
      options: {
        executionMode: 'live',
      },
    });

    const blocked = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly',
      actorId: 'delegate',
      sourceSurface: 'desktop-client',
      options: {
        executionMode: 'live',
      },
    });

    const byActor = await service.listWorkflowCommandRuns(20, {
      actorId: 'delegate',
    });
    expect(byActor.some(run => run.id === delegateDryRun.id)).toBe(true);
    expect(byActor.some(run => run.id === ownerLive.id)).toBe(false);

    const bySurface = await service.listWorkflowCommandRuns(20, {
      sourceSurface: 'finance-os-web',
    });
    expect(bySurface.some(run => run.id === ownerLive.id)).toBe(true);
    expect(bySurface.some(run => run.id === delegateDryRun.id)).toBe(false);

    const dryRuns = await service.listWorkflowCommandRuns(20, {
      executionMode: 'dry-run',
    });
    expect(dryRuns.some(run => run.id === delegateDryRun.id)).toBe(true);
    expect(dryRuns.some(run => run.id === ownerLive.id)).toBe(false);

    const errorsOnly = await service.listWorkflowCommandRuns(20, { hasErrors: true });
    expect(errorsOnly.some(run => run.id === blocked.id)).toBe(true);
    expect(errorsOnly.every(run => run.errorCount > 0)).toBe(true);
  });

  it('supports dry-run command chains without mutating queue state', async () => {
    const { service, queue } = await createHarness();

    const run = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly -> batch-renegotiate',
      assignee: 'delegate',
      options: {
        executionMode: 'dry-run',
      },
    });

    expect(run.errorCount).toBe(0);
    expect(run.steps.every(step => step.detail.toLowerCase().includes('dry-run'))).toBe(
      true,
    );

    const queued = await queue.dequeue(20);
    expect(queued.some(job => job.name === 'workflow.close.run')).toBe(false);
    expect(queued.some(job => job.name === 'delegate.lane.assigned')).toBe(false);
  });

  it('blocks strict live runs on guardrail violations and allows balanced runs', async () => {
    const { service } = await createHarness();

    const strictRun = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly',
      actorId: 'delegate',
      options: {
        executionMode: 'live',
        guardrailProfile: 'strict',
        rollbackOnFailure: false,
      },
    });
    expect(strictRun.status).toBe('blocked');
    expect(strictRun.guardrailResults.some(result => result.blocking && !result.passed)).toBe(
      true,
    );
    expect(strictRun.statusTimeline.at(-1)?.status).toBe('blocked');

    const balancedRun = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly',
      actorId: 'delegate',
      options: {
        executionMode: 'live',
        guardrailProfile: 'balanced',
        rollbackOnFailure: false,
      },
    });
    expect(balancedRun.status).not.toBe('blocked');
  });

  it('returns terminal command runs for matching idempotency keys', async () => {
    const { service } = await createHarness();

    const first = await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
      options: {
        executionMode: 'live',
        idempotencyKey: 'cmd-idempotency-0001',
      },
    });
    const second = await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
      options: {
        executionMode: 'live',
        idempotencyKey: 'cmd-idempotency-0001',
      },
    });

    expect(second.id).toBe(first.id);
  });

  it('rolls back reversible live command runs within the rollback window', async () => {
    const { service } = await createHarness();

    const run = await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
      options: {
        executionMode: 'live',
        rollbackWindowMinutes: 30,
      },
    });
    expect(run.rollbackEligible).toBe(true);

    const rollback = await service.rollbackCommandRun({
      runId: run.id,
      reason: 'contract-test',
    });
    expect(rollback).not.toBeNull();
    expect(rollback?.rollbackOfRunId).toBe(run.id);
    expect(rollback?.status).toBe('completed');
    expect(rollback?.statusTimeline.map(transition => transition.status)).toEqual([
      'planned',
      'running',
      'completed',
    ]);
  });

  it('rejects rollback when command run is not rollback-eligible', async () => {
    const { service } = await createHarness();

    const run = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly',
      options: {
        executionMode: 'live',
        rollbackOnFailure: false,
      },
    });
    expect(run.rollbackEligible).toBe(false);

    await expect(
      service.rollbackCommandRun({
        runId: run.id,
      }),
    ).rejects.toThrow('run-not-rollback-eligible');
  });

  it('auto-rolls back failed eligible live playbook runs when rollbackOnFailure is enabled', async () => {
    const { service } = await createHarness();

    const playbook = await service.createPlaybook({
      name: 'Playbook Auto Rollback',
      description: 'fails with reversible executed effects',
      commands: [{ verb: 'open-urgent-review' }, { verb: 'unknown-step' }],
    });

    const run = await service.runPlaybook(playbook.id, {
      executionMode: 'live',
      rollbackOnFailure: true,
      rollbackWindowMinutes: 30,
      guardrailProfile: 'strict',
    });

    expect(run).not.toBeNull();
    expect(run?.status).toBe('failed');
    expect(run?.rollbackEligible).toBe(true);

    const history = await service.listPlaybookRuns(20, {
      playbookId: playbook.id,
    });
    const original = history.find(item => item.id === run?.id);
    const rollback = history.find(item => item.rollbackOfRunId === run?.id);

    expect(original?.status).toBe('rolled_back');
    expect(rollback).toBeDefined();
    expect(rollback?.status).toBe('completed');
    expect(rollback?.statusTimeline.map(transition => transition.status)).toEqual([
      'planned',
      'running',
      'completed',
    ]);
  });

  it('rejects rollback when rollback window has expired', async () => {
    const { service, repository } = await createHarness();
    const now = Date.now();
    const runId = 'expired-rollback-run';

    await repository.createWorkflowCommandRun({
      id: runId,
      chain: 'triage -> open-review',
      steps: [
        {
          id: 'resolve-next-action',
          raw: 'triage',
          canonical: 'resolve-next',
          status: 'ok',
          detail: 'resolved',
          route: '/ops',
        },
      ],
      executionMode: 'live',
      guardrailProfile: 'strict',
      status: 'completed',
      startedAtMs: now - 120_000,
      finishedAtMs: now - 119_000,
      rollbackWindowUntilMs: now - 1_000,
      rollbackEligible: true,
      rollbackOfRunId: undefined,
      statusTimeline: [
        { status: 'planned', atMs: now - 120_000, note: 'Execution accepted.' },
        { status: 'running', atMs: now - 119_999, note: 'Execution started.' },
        { status: 'completed', atMs: now - 119_000, note: 'Execution completed.' },
      ],
      guardrailResults: [],
      effectSummaries: [
        {
          effectId: 'effect-1',
          kind: 'navigation.open-review',
          description: 'opened review',
          reversible: true,
          status: 'applied',
          metadata: {},
        },
      ],
      idempotencyKey: undefined,
      rollbackOnFailure: true,
      errorCount: 0,
      actorId: 'owner',
      sourceSurface: 'test',
      executedAtMs: now - 120_000,
    });

    await expect(
      service.rollbackCommandRun({
        runId,
      }),
    ).rejects.toThrow('rollback-window-expired');
  });

  it('blocks privileged chain steps for delegate actors', async () => {
    const { service, queue } = await createHarness();

    const run = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly -> open-review',
      actorId: 'delegate',
      options: {
        executionMode: 'live',
        guardrailProfile: 'strict',
      },
    });

    expect(run.status).toBe('blocked');
    expect(run.errorCount).toBeGreaterThanOrEqual(1);
    expect(run.steps[0]).toMatchObject({
      status: 'error',
    });

    const queued = await queue.dequeue(20);
    expect(queued.some(job => job.name === 'workflow.close.run')).toBe(false);
  });

  it('enforces delegate lane transitions and records lifecycle events', async () => {
    const { service } = await createHarness();

    const lane = await service.assignDelegateLane({
      title: 'Renegotiate internet contract',
      assignee: 'delegate',
      assignedBy: 'owner',
      priority: 'high',
      payload: { contractId: 'internet-1' },
    });

    const invalid = await service.transitionDelegateLane({
      laneId: lane.id,
      status: 'completed',
      actorId: 'delegate',
    });
    expect(invalid).toEqual({
      ok: false,
      error: 'invalid-lane-transition',
    });

    const accepted = await service.transitionDelegateLane({
      laneId: lane.id,
      status: 'accepted',
      actorId: 'delegate',
    });
    expect(accepted.ok).toBe(true);

    const completed = await service.transitionDelegateLane({
      laneId: lane.id,
      status: 'completed',
      actorId: 'delegate',
    });
    expect(completed.ok).toBe(true);

    const note = await service.commentDelegateLane({
      laneId: lane.id,
      actorId: 'owner',
      message: 'Validate cancellation fee before call.',
    });
    expect(note?.type).toBe('comment');

    const events = await service.listDelegateLaneEvents({
      laneId: lane.id,
      limit: 20,
    });
    expect(events.map(event => event.type)).toContain('assigned');
    expect(events.map(event => event.type)).toContain('accepted');
    expect(events.map(event => event.type)).toContain('completed');
    expect(events.map(event => event.type)).toContain('comment');
  });

  it('submits and streams ledger events', async () => {
    const { service } = await createHarness();

    const envelope = createCommandEnvelope({
      commandId: 'cmd-ledger-1',
      actorId: 'tester',
      tenantId: 'tenant-1',
      workspaceId: 'workspace-1',
      intent: 'submit-ledger-command',
      workflowId: 'ledger',
      sourceSurface: 'tests',
      confidenceContext: { score: 0.8, rationale: 'test' },
    });

    const event = await service.submitLedgerCommand({
      workspaceId: envelope.workspaceId,
      actorId: envelope.actorId,
      commandType: 'ledger.transaction.created',
      aggregateId: 'transaction-1',
      aggregateType: 'transaction',
      payload: { amount: 1234 },
    });

    expect(event.eventId).toBeTruthy();

    const stream = await service.streamLedgerEvents({
      workspaceId: envelope.workspaceId,
      limit: 10,
    });

    expect(stream.events.length).toBeGreaterThan(0);
    expect(stream.events[0].type).toBe('ledger.transaction.created');
  });

  it('assigns ledger versions per workspace+aggregate stream', async () => {
    const { service } = await createHarness();

    const firstA1 = await service.submitLedgerCommand({
      workspaceId: 'workspace-1',
      actorId: 'tester',
      commandType: 'ledger.transaction.created',
      aggregateId: 'transaction-a1',
      aggregateType: 'transaction',
      payload: { amount: 100 },
    });

    const firstA2 = await service.submitLedgerCommand({
      workspaceId: 'workspace-1',
      actorId: 'tester',
      commandType: 'ledger.transaction.created',
      aggregateId: 'transaction-a2',
      aggregateType: 'transaction',
      payload: { amount: 200 },
    });

    const secondA1 = await service.submitLedgerCommand({
      workspaceId: 'workspace-1',
      actorId: 'tester',
      commandType: 'ledger.transaction.updated',
      aggregateId: 'transaction-a1',
      aggregateType: 'transaction',
      payload: { amount: 150 },
    });

    const firstOtherWorkspace = await service.submitLedgerCommand({
      workspaceId: 'workspace-2',
      actorId: 'tester',
      commandType: 'ledger.transaction.created',
      aggregateId: 'transaction-a1',
      aggregateType: 'transaction',
      payload: { amount: 999 },
    });

    expect(firstA1.version).toBe(1);
    expect(firstA2.version).toBe(1);
    expect(secondA1.version).toBe(2);
    expect(firstOtherWorkspace.version).toBe(1);
  });

  it('streams ledger events with deterministic newest-first keyset pagination', async () => {
    const { service } = await createHarness();

    const originalNow = Date.now;
    Date.now = () => 1_771_000_000_000;

    try {
      const submitted: LedgerEvent[] = [];

      for (let index = 1; index <= 5; index += 1) {
        submitted.push(
          await service.submitLedgerCommand({
            workspaceId: 'workspace-pagination',
            actorId: 'tester',
            commandType: `ledger.transaction.event-${index}`,
            aggregateId: `aggregate-${index}`,
            aggregateType: 'transaction',
            payload: { index },
          }),
        );
      }

      const expectedNewestFirst = [...submitted]
        .reverse()
        .map(event => event.eventId);

      const page1 = await service.streamLedgerEvents({
        workspaceId: 'workspace-pagination',
        limit: 2,
      });
      expect(page1.events.map(event => event.eventId)).toEqual(
        expectedNewestFirst.slice(0, 2),
      );
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await service.streamLedgerEvents({
        workspaceId: 'workspace-pagination',
        cursor: page1.nextCursor,
        limit: 2,
      });
      expect(page2.events.map(event => event.eventId)).toEqual(
        expectedNewestFirst.slice(2, 4),
      );
      expect(page2.nextCursor).toBeTruthy();

      const page3 = await service.streamLedgerEvents({
        workspaceId: 'workspace-pagination',
        cursor: page2.nextCursor,
        limit: 2,
      });
      expect(page3.events.map(event => event.eventId)).toEqual(
        expectedNewestFirst.slice(4),
      );
      expect(page3.nextCursor).toBeUndefined();
    } finally {
      Date.now = originalNow;
    }
  });

  it('keeps ops activity query latency within p95 budget under load', async () => {
    const { service, repository } = await createHarness();
    const now = Date.now();

    await Promise.all(
      Array.from({ length: 3000 }, (_, index) =>
        repository.appendOpsActivityEvent({
          id: `perf-event-${index.toString().padStart(4, '0')}`,
          kind: 'workflow-command-run',
          title: `Perf event ${index}`,
          detail: 'load benchmark',
          severity: index % 17 === 0 ? 'critical' : 'info',
          createdAtMs: now - index,
          meta: {
            index,
          },
        }),
      ),
    );

    const durations: number[] = [];
    let cursor: string | undefined;

    for (let index = 0; index < 80; index += 1) {
      const startedAt = Date.now();
      const result = await service.listOpsActivity({
        limit: 40,
        cursor,
      });
      durations.push(Date.now() - startedAt);
      cursor = result.nextCursor;
      if (!cursor) {
        cursor = undefined;
      }
    }

    const sorted = durations.slice().sort((a, b) => a - b);
    const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    const p95 = sorted[p95Index] || 0;

    expect(p95).toBeLessThanOrEqual(40);
  });

  it('keeps fingerprint claim latency within p95 budget under contention and duplicate-skip load', async () => {
    const { service, repository } = await createHarness();
    const contentionFingerprint = `perf-fp-contended-${Date.now()}`;
    const contentionRuns = 200;

    const contentionClaims = await Promise.all(
      Array.from({ length: contentionRuns }, async (_unused, index) => {
        const startedAt = Date.now();
        const claim = await service.claimWorkerJobFingerprint({
          workerId: `perf-contention-${index}`,
          fingerprint: contentionFingerprint,
          ttlMs: 60_000,
        });
        return {
          claim,
          durationMs: Date.now() - startedAt,
        };
      }),
    );

    const contentionP95Durations = contentionClaims
      .map(entry => entry.durationMs)
      .sort((a, b) => a - b);
    const contentionP95Index = Math.max(
      0,
      Math.ceil(contentionP95Durations.length * 0.95) - 1,
    );
    const contentionP95 = contentionP95Durations[contentionP95Index] || 0;
    expect(contentionP95).toBeLessThanOrEqual(60);

    const acquiredClaim = contentionClaims.find(entry => entry.claim.status === 'acquired');
    expect(acquiredClaim).toBeDefined();
    expect(
      contentionClaims.filter(entry => entry.claim.status === 'already-claimed').length,
    ).toBe(contentionRuns - 1);

    if (!acquiredClaim) {
      return;
    }

    await service.ackQueueJob({
      workerId: acquiredClaim.claim.ownerId,
      receipt: `perf-release-${Date.now()}`,
      success: true,
      requeue: false,
      jobId: 'perf-job-release',
      jobName: 'perf-job-release',
      jobFingerprint: contentionFingerprint,
      attempt: 1,
      processingMs: 1,
      payload: {},
    });

    const duplicateFingerprint = `perf-fp-processed-${Date.now()}`;
    await repository.createWorkerJobAttempt({
      id: `attempt-${duplicateFingerprint}`,
      workerId: 'perf-worker-processed',
      jobId: 'perf-job-processed',
      jobName: 'perf-job-processed',
      jobFingerprint: duplicateFingerprint,
      receipt: `receipt-${duplicateFingerprint}`,
      attempt: 1,
      outcome: 'acked',
      processingMs: 1,
      payload: {},
      createdAtMs: Date.now(),
    });

    const duplicateRuns = 200;
    const duplicateClaims = await Promise.all(
      Array.from({ length: duplicateRuns }, async (_unused, index) => {
        const startedAt = Date.now();
        const claim = await service.claimWorkerJobFingerprint({
          workerId: `perf-duplicate-${index}`,
          fingerprint: duplicateFingerprint,
          ttlMs: 60_000,
        });
        return {
          claim,
          durationMs: Date.now() - startedAt,
        };
      }),
    );
    expect(
      duplicateClaims.every(entry => entry.claim.status === 'already-processed'),
    ).toBe(true);

    const duplicateP95Durations = duplicateClaims
      .map(entry => entry.durationMs)
      .sort((a, b) => a - b);
    const duplicateP95Index = Math.max(
      0,
      Math.ceil(duplicateP95Durations.length * 0.95) - 1,
    );
    const duplicateP95 = duplicateP95Durations[duplicateP95Index] || 0;
    expect(duplicateP95).toBeLessThanOrEqual(60);

    const staleFingerprint = `perf-fp-stale-${Date.now()}`;
    const staleLeaseKey = `worker-fingerprint:${staleFingerprint}`;
    await repository.acquireSystemLease({
      leaseKey: staleLeaseKey,
      ownerId: 'perf-stale-owner-a',
      ttlMs: 1,
    });
    await new Promise(resolve => setTimeout(resolve, 5));

    const staleStartedAt = Date.now();
    const staleRecoveryClaim = await service.claimWorkerJobFingerprint({
      workerId: 'perf-stale-owner-b',
      fingerprint: staleFingerprint,
      ttlMs: 60_000,
    });
    const staleRecoveryDuration = Date.now() - staleStartedAt;
    expect(staleRecoveryClaim.status).toBe('acquired');
    expect(staleRecoveryDuration).toBeLessThanOrEqual(60);
  });

  it('enforces system lease ownership for critical orchestration locks', async () => {
    const { repository } = await createHarness();

    const acquiredOwnerA = await repository.acquireSystemLease({
      leaseKey: 'lease-test',
      ownerId: 'owner-a',
      ttlMs: 60_000,
    });
    expect(acquiredOwnerA).toBe(true);

    const acquiredOwnerB = await repository.acquireSystemLease({
      leaseKey: 'lease-test',
      ownerId: 'owner-b',
      ttlMs: 60_000,
    });
    expect(acquiredOwnerB).toBe(false);

    const releaseWrongOwner = await repository.releaseSystemLease({
      leaseKey: 'lease-test',
      ownerId: 'owner-b',
    });
    expect(releaseWrongOwner).toBe(false);

    const releaseOwnerA = await repository.releaseSystemLease({
      leaseKey: 'lease-test',
      ownerId: 'owner-a',
    });
    expect(releaseOwnerA).toBe(true);

    const acquiredAfterRelease = await repository.acquireSystemLease({
      leaseKey: 'lease-test',
      ownerId: 'owner-b',
      ttlMs: 60_000,
    });
    expect(acquiredAfterRelease).toBe(true);
  });
});
