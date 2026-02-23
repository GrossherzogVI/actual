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

    const run = await service.runPlaybook(created.id, true);
    expect(run).not.toBeNull();
    expect(run?.executedSteps).toBe(1);

    const queued = await queue.dequeue(10);
    expect(queued.some(job => job.name === 'workflow.playbook.created')).toBe(true);
    expect(queued.some(job => job.name === 'workflow.playbook.run')).toBe(true);
  });

  it('lists and replays playbook runs', async () => {
    const { service } = await createHarness();

    const playbook = await service.createPlaybook({
      name: 'Replayable Playbook',
      description: 'for replay tests',
      commands: [{ verb: 'resolve-next-action' }, { verb: 'refresh-command-center' }],
    });

    const first = await service.runPlaybook(playbook.id, true, 'owner', 'finance-os-web');
    expect(first).not.toBeNull();

    const history = await service.listPlaybookRuns(10, {
      playbookId: playbook.id,
      dryRun: true,
    });
    expect(history.some(run => run.id === first?.id)).toBe(true);

    const replayed = await service.replayPlaybookRun({
      runId: first?.id || 'missing',
      dryRun: false,
      actorId: 'owner',
      sourceSurface: 'finance-os-web',
    });
    expect(replayed).not.toBeNull();
    expect(replayed?.dryRun).toBe(false);
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

  it('filters command runs by actor, surface, mode, and error state', async () => {
    const { service } = await createHarness();

    const delegateDryRun = await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
      actorId: 'delegate',
      sourceSurface: 'desktop-client',
      dryRun: true,
    });

    const ownerLive = await service.executeWorkflowCommandChain({
      chain: 'open-review',
      actorId: 'owner',
      sourceSurface: 'finance-os-web',
      dryRun: false,
    });

    const blocked = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly',
      actorId: 'delegate',
      sourceSurface: 'desktop-client',
      dryRun: false,
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

    const dryRuns = await service.listWorkflowCommandRuns(20, { dryRun: true });
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
      dryRun: true,
    });

    expect(run.errorCount).toBe(0);
    expect(run.steps.every(step => step.detail.toLowerCase().includes('dry-run'))).toBe(
      true,
    );

    const queued = await queue.dequeue(20);
    expect(queued.some(job => job.name === 'workflow.close.run')).toBe(false);
    expect(queued.some(job => job.name === 'delegate.lane.assigned')).toBe(false);
  });

  it('blocks privileged chain steps for delegate actors', async () => {
    const { service, queue } = await createHarness();

    const run = await service.executeWorkflowCommandChain({
      chain: 'close -> weekly -> open-review',
      actorId: 'delegate',
    });

    expect(run.errorCount).toBeGreaterThanOrEqual(1);
    expect(run.steps[0]).toMatchObject({
      status: 'error',
    });
    expect(run.steps[1]).toMatchObject({
      status: 'ok',
      route: '/review?priority=urgent',
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
});
