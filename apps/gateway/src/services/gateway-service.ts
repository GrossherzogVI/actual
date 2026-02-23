import { customAlphabet } from 'nanoid';

import {
  rankRecommendations,
  type Recommendation,
} from '@finance-os/domain-kernel';

import type { GatewayRepository } from '../repositories/types';
import type { GatewayQueue, QueueJob } from '../queue/types';
import type {
  CloseRun,
  DelegateLane,
  EgressAuditEntry,
  EgressPolicy,
  FocusPanel,
  LedgerEvent,
  PlaybookRun,
  ScenarioBranch,
  ScenarioComparison,
  ScenarioMutation,
  WorkflowAction,
  WorkflowPlaybook,
} from '../types';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

export type GatewayService = ReturnType<typeof createGatewayService>;

function queueJob(name: string, payload: Record<string, unknown>): QueueJob {
  return {
    id: nanoid(),
    name,
    payload,
    createdAtMs: Date.now(),
  };
}

export function createGatewayService(
  repository: GatewayRepository,
  queue: GatewayQueue,
) {
  async function resolveNextAction(): Promise<WorkflowAction> {
    const state = await repository.getOpsState();

    if (state.urgentReviews > 0) {
      return {
        id: 'next-urgent-review',
        title: `${state.urgentReviews} urgent review item(s)`,
        route: '/review?priority=urgent',
        confidence: 0.94,
      };
    }

    if (state.expiringContracts > 0) {
      return {
        id: 'next-expiring-contracts',
        title: `${state.expiringContracts} contract(s) expiring in 30d`,
        route: '/contracts?filter=expiring',
        confidence: 0.89,
      };
    }

    return {
      id: 'next-close-routine',
      title: 'Run weekly close routine',
      route: '/ops',
      confidence: 0.8,
    };
  }

  async function getMoneyPulse() {
    const state = await repository.getOpsState();
    return {
      pendingReviews: state.pendingReviews,
      urgentReviews: state.urgentReviews,
      expiringContracts: state.expiringContracts,
      generatedAtMs: Date.now(),
    };
  }

  async function listPlaybooks(): Promise<WorkflowPlaybook[]> {
    return repository.listPlaybooks();
  }

  async function createPlaybook(input: {
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
  }): Promise<WorkflowPlaybook> {
    const now = Date.now();
    const playbook = await repository.createPlaybook({
      id: nanoid(),
      name: input.name,
      description: input.description,
      commands: input.commands,
      createdAtMs: now,
    });

    await queue.enqueue(
      queueJob('workflow.playbook.created', {
        playbookId: playbook.id,
      }),
    );

    return playbook;
  }

  async function runPlaybook(
    playbookId: string,
    dryRun: boolean,
  ): Promise<PlaybookRun | null> {
    const playbook = await repository.getPlaybookById(playbookId);
    if (!playbook) return null;

    const run: PlaybookRun = {
      id: nanoid(),
      playbookId,
      dryRun,
      executedSteps: playbook.commands.length,
      steps: playbook.commands.map((command, index) => ({
        index,
        command,
        status: 'queued',
      })),
      createdAtMs: Date.now(),
    };

    await repository.createPlaybookRun(run);
    await queue.enqueue(
      queueJob('workflow.playbook.run', {
        runId: run.id,
        playbookId,
        dryRun,
      }),
    );

    return run;
  }

  async function runCloseRoutine(period: 'weekly' | 'monthly'): Promise<CloseRun> {
    const state = await repository.getOpsState();
    const run: CloseRun = {
      id: nanoid(),
      period,
      exceptionCount: state.pendingReviews + state.expiringContracts,
      summary: {
        pendingReviews: state.pendingReviews,
        urgentReviews: state.urgentReviews,
        expiringContracts: state.expiringContracts,
      },
      createdAtMs: Date.now(),
    };

    await repository.createCloseRun(run);
    await queue.enqueue(
      queueJob('workflow.close.run', {
        runId: run.id,
        period,
        exceptionCount: run.exceptionCount,
      }),
    );

    return run;
  }

  async function applyBatchPolicy(
    ids: string[],
    status: string,
    resolvedAction: string,
  ): Promise<{ updatedCount: number }> {
    const state = await repository.getOpsState();
    const updatedCount = Math.min(ids.length, state.pendingReviews);

    await repository.setOpsState({
      pendingReviews: Math.max(0, state.pendingReviews - updatedCount),
    });

    await queue.enqueue(
      queueJob('workflow.batch-policy.applied', {
        ids,
        status,
        resolvedAction,
        updatedCount,
      }),
    );

    return { updatedCount };
  }

  async function getAdaptiveFocusPanel(): Promise<FocusPanel> {
    const state = await repository.getOpsState();

    const actions = [
      {
        id: 'focus-urgent-review',
        title: 'Clear urgent review queue',
        route: '/review?priority=urgent',
        score: state.urgentReviews * 100,
        reason: 'Urgent queue items carry highest immediate financial risk.',
      },
      {
        id: 'focus-expiring-contracts',
        title: 'Inspect expiring contracts',
        route: '/contracts?filter=expiring',
        score: state.expiringContracts * 85,
        reason: 'Contract deadlines create time-sensitive spend outcomes.',
      },
      {
        id: 'focus-close-routine',
        title: 'Run weekly close',
        route: '/ops',
        score: Math.max(20, state.pendingReviews * 8),
        reason: 'Close loop compresses unresolved manual operations.',
      },
    ]
      .filter(action => action.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      actions,
      generatedAtMs: Date.now(),
    };
  }

  async function recordActionOutcome(input: {
    actionId: string;
    outcome: string;
    notes?: string;
  }) {
    return repository.recordActionOutcome({
      id: nanoid(),
      actionId: input.actionId,
      outcome: input.outcome,
      notes: input.notes,
      recordedAtMs: Date.now(),
    });
  }

  async function listScenarioBranches(): Promise<ScenarioBranch[]> {
    return repository.listScenarioBranches();
  }

  async function createScenarioBranch(input: {
    name: string;
    baseBranchId?: string;
    notes?: string;
  }): Promise<ScenarioBranch> {
    const now = Date.now();
    const branch: ScenarioBranch = {
      id: nanoid(),
      name: input.name,
      status: 'draft',
      baseBranchId: input.baseBranchId,
      notes: input.notes,
      createdAtMs: now,
      updatedAtMs: now,
    };

    await repository.createScenarioBranch(branch);
    await queue.enqueue(
      queueJob('scenario.branch.created', {
        branchId: branch.id,
      }),
    );

    return branch;
  }

  async function applyScenarioMutation(input: {
    branchId: string;
    mutationKind: string;
    payload: Record<string, unknown>;
  }): Promise<ScenarioMutation | null> {
    const mutation: ScenarioMutation = {
      id: nanoid(),
      branchId: input.branchId,
      kind: input.mutationKind,
      payload: input.payload,
      createdAtMs: Date.now(),
    };

    const created = await repository.addScenarioMutation(mutation);
    if (!created) return null;

    await queue.enqueue(
      queueJob('scenario.mutation.applied', {
        mutationId: created.id,
        branchId: created.branchId,
      }),
    );

    return created;
  }

  async function compareScenarioOutcomes(
    branchId: string,
    againstBranchId?: string,
  ): Promise<ScenarioComparison | null> {
    const primaryBranch = await repository.getScenarioBranchById(branchId);
    if (!primaryBranch) return null;

    const againstBranch = againstBranchId
      ? await repository.getScenarioBranchById(againstBranchId)
      : null;

    const summarize = async (id?: string) => {
      if (!id) {
        return { amountDelta: 0, riskDelta: 0 };
      }

      const mutations = await repository.listScenarioMutations(id);
      return mutations.reduce(
        (acc, mutation) => {
          const amountDelta = mutation.payload.amountDelta;
          const riskDelta = mutation.payload.riskDelta;

          acc.amountDelta += typeof amountDelta === 'number' ? amountDelta : 0;
          acc.riskDelta += typeof riskDelta === 'number' ? riskDelta : 0;
          return acc;
        },
        { amountDelta: 0, riskDelta: 0 },
      );
    };

    const primary = await summarize(primaryBranch.id);
    const against = await summarize(againstBranch?.id);

    return {
      primaryBranchId: primaryBranch.id,
      againstBranchId: againstBranch?.id,
      primary,
      against,
      diff: {
        amountDelta: primary.amountDelta - against.amountDelta,
        riskDelta: primary.riskDelta - against.riskDelta,
      },
    };
  }

  async function adoptScenarioBranch(branchId: string): Promise<ScenarioBranch | null> {
    const adoptedAtMs = Date.now();
    const branch = await repository.adoptScenarioBranch(branchId, adoptedAtMs);
    if (!branch) return null;

    await queue.enqueue(
      queueJob('scenario.branch.adopted', {
        branchId,
      }),
    );

    return branch;
  }

  async function listDelegateLanes(): Promise<DelegateLane[]> {
    return repository.listDelegateLanes();
  }

  async function assignDelegateLane(input: {
    title: string;
    assignee: string;
    assignedBy: string;
    payload: Record<string, unknown>;
  }): Promise<DelegateLane> {
    const now = Date.now();
    const lane: DelegateLane = {
      id: nanoid(),
      title: input.title,
      status: 'assigned',
      assignee: input.assignee,
      assignedBy: input.assignedBy,
      payload: input.payload,
      createdAtMs: now,
      updatedAtMs: now,
    };

    await repository.createDelegateLane(lane);
    await queue.enqueue(
      queueJob('delegate.lane.assigned', {
        laneId: lane.id,
        assignee: lane.assignee,
      }),
    );

    return lane;
  }

  async function transitionDelegateLane(
    laneId: string,
    status: DelegateLane['status'],
  ): Promise<DelegateLane | null> {
    const lane = await repository.getDelegateLaneById(laneId);
    if (!lane) return null;

    const now = Date.now();
    const updated: DelegateLane = {
      ...lane,
      status,
      updatedAtMs: now,
      acceptedAtMs: status === 'accepted' ? now : lane.acceptedAtMs,
      completedAtMs: status === 'completed' ? now : lane.completedAtMs,
      rejectedAtMs: status === 'rejected' ? now : lane.rejectedAtMs,
    };

    await repository.updateDelegateLane(updated);
    await queue.enqueue(
      queueJob('delegate.lane.transitioned', {
        laneId,
        status,
      }),
    );

    return updated;
  }

  async function getEgressPolicy(): Promise<EgressPolicy> {
    return repository.getEgressPolicy();
  }

  async function setEgressPolicy(policy: EgressPolicy): Promise<EgressPolicy> {
    const updatedPolicy = await repository.setEgressPolicy(policy);

    await repository.recordEgressAudit({
      id: nanoid(),
      eventType: 'policy-updated',
      payload: {
        allowCloud: updatedPolicy.allowCloud,
        allowedProviders: updatedPolicy.allowedProviders,
        redactionMode: updatedPolicy.redactionMode,
      },
      createdAtMs: Date.now(),
    });

    return updatedPolicy;
  }

  async function listEgressAudit(limit: number): Promise<EgressAuditEntry[]> {
    return repository.listEgressAudit(limit);
  }

  async function recordEgressAudit(input: {
    eventType: string;
    provider?: string;
    payload?: Record<string, unknown>;
  }): Promise<EgressAuditEntry> {
    return repository.recordEgressAudit({
      id: nanoid(),
      eventType: input.eventType,
      provider: input.provider,
      payload: input.payload,
      createdAtMs: Date.now(),
    });
  }

  async function recommend(): Promise<Recommendation[]> {
    const state = await repository.getOpsState();

    return rankRecommendations([
      {
        id: 'rec-review-urgent',
        title: 'Prioritize urgent review queue',
        confidence: 0.92,
        provenance: 'focus-engine',
        expectedImpact: 'risk-reduction',
        reversible: true,
        rationale: `${state.urgentReviews} urgent review item(s) can trigger immediate cashflow mistakes.`,
      },
      {
        id: 'rec-contract-expiring',
        title: 'Review expiring contracts this week',
        confidence: 0.88,
        provenance: 'contracts-engine',
        expectedImpact: 'cost-avoidance',
        reversible: true,
        rationale: `${state.expiringContracts} contract(s) are within cancellation window.`,
      },
      {
        id: 'rec-close-loop',
        title: 'Run weekly close loop',
        confidence: 0.81,
        provenance: 'workflow-engine',
        expectedImpact: 'operational-compression',
        reversible: true,
        rationale: `${state.pendingReviews} pending item(s) can be compressed through close routine automation.`,
      },
    ]);
  }

  async function explain(recommendation: Recommendation) {
    return {
      explanation:
        `Recommendation ${recommendation.id} targets ${recommendation.expectedImpact}. ` +
        `Confidence ${recommendation.confidence.toFixed(2)} with rationale: ${recommendation.rationale}`,
      confidence: recommendation.confidence,
      reversible: recommendation.reversible,
    };
  }

  async function classify(payee: string) {
    const normalized = payee.toLowerCase();

    if (
      normalized.includes('rewe') ||
      normalized.includes('edeka') ||
      normalized.includes('aldi')
    ) {
      return { categoryHint: 'lebensmittel.supermarkt', confidence: 0.87 };
    }

    if (normalized.includes('bahn') || normalized.includes('db')) {
      return { categoryHint: 'mobilitaet.oepnv', confidence: 0.84 };
    }

    if (normalized.includes('netflix') || normalized.includes('spotify')) {
      return { categoryHint: 'freizeit.streaming', confidence: 0.91 };
    }

    return { categoryHint: 'sonstiges.unkategorisiert', confidence: 0.57 };
  }

  async function forecast(months: number) {
    const state = await repository.getOpsState();
    const projectedMonthlyCommitment =
      120_000 + state.pendingReviews * 500 + state.expiringContracts * 300;

    return {
      months,
      projectedMonthlyCommitment,
      projectedTotalCommitment: projectedMonthlyCommitment * months,
      generatedAtMs: Date.now(),
    };
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
    const stream = await repository.streamLedgerEvents({
      workspaceId: input.workspaceId,
      limit: 1,
    });

    const version = (stream.events[0]?.version || 0) + 1;

    const event: LedgerEvent = {
      eventId: nanoid(),
      workspaceId: input.workspaceId,
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      type: input.commandType,
      payload: input.payload,
      actorId: input.actorId,
      occurredAtMs: Date.now(),
      version,
    };

    await repository.appendLedgerEvent(event);
    await queue.enqueue(
      queueJob('ledger.command.submitted', {
        eventId: event.eventId,
        workspaceId: event.workspaceId,
        commandType: event.type,
      }),
    );

    return event;
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

  async function getRuntimeMetrics() {
    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();
    const playbooks = await repository.listPlaybooks();
    const lanes = await repository.listDelegateLanes();
    const corrections = await repository.listCorrections(1000);
    const branches = await repository.listScenarioBranches();

    return {
      repositoryKind: repository.kind,
      queueKind: queue.kind,
      queueSize,
      queueInFlight,
      playbooks: playbooks.length,
      delegateLanes: lanes.length,
      corrections: corrections.length,
      scenarioBranches: branches.length,
    };
  }

  return {
    repository,
    queue,
    resolveNextAction,
    getMoneyPulse,
    listPlaybooks,
    createPlaybook,
    runPlaybook,
    runCloseRoutine,
    applyBatchPolicy,
    getAdaptiveFocusPanel,
    recordActionOutcome,
    listScenarioBranches,
    createScenarioBranch,
    applyScenarioMutation,
    compareScenarioOutcomes,
    adoptScenarioBranch,
    listDelegateLanes,
    assignDelegateLane,
    transitionDelegateLane,
    getEgressPolicy,
    setEgressPolicy,
    listEgressAudit,
    recordEgressAudit,
    recommend,
    explain,
    classify,
    forecast,
    learnCorrection,
    submitLedgerCommand,
    streamLedgerEvents,
    getProjectionSnapshot,
    getRuntimeMetrics,
  };
}
