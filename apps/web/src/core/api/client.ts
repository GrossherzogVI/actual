import { createCommandEnvelope } from '@finance-os/domain-kernel';

import type {
  ActionOutcome,
  AppRecommendation,
  CloseRun,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  EgressPolicy,
  ExecutionMode,
  FocusPanel,
  GuardrailProfile,
  MoneyPulse,
  NarrativePulse,
  OpsActivityKind,
  OpsActivityListResult,
  OpsActivityPipelineStartResult,
  OpsActivityPipelineStatus,
  OpsActivitySeverity,
  OpsBackfillResult,
  OpsMaintenanceResult,
  QueueRequeueExpiredResult,
  Playbook,
  PlaybookRun,
  RuntimeMetrics,
  ScenarioAdoptionCheck,
  ScenarioBranch,
  ScenarioBranchPromotionResult,
  ScenarioComparison,
  ScenarioLineage,
  ScenarioMutation,
  ScenarioSimulationResult,
  ScenarioSimulationSource,
  TemporalSignals,
  ReplayWorkerDeadLettersResult,
  WorkerDeadLetter,
  WorkerQueueHealth,
  WorkflowCommandExecution,
} from '../types';

const gatewayBaseUrl = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:7070';
const gatewayInternalToken = import.meta.env.VITE_GATEWAY_INTERNAL_TOKEN || '';

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${gatewayBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} ${path}: ${text}`);
  }

  return response.json() as Promise<T>;
}

function commandEnvelope(intent: string) {
  return createCommandEnvelope({
    commandId: `cmd-${Date.now()}`,
    actorId: 'owner',
    tenantId: 'default',
    workspaceId: 'default',
    intent,
    workflowId: 'ops-superhuman',
    sourceSurface: 'finance-os-web',
    confidenceContext: {
      score: 0.8,
      rationale: 'user-triggered',
    },
  });
}

type RunExecutionOptions = {
  executionMode: ExecutionMode;
  guardrailProfile: GuardrailProfile;
  rollbackWindowMinutes: number;
  idempotencyKey?: string;
  rollbackOnFailure: boolean;
};

function normalizeRunOptions(
  input: Partial<RunExecutionOptions> | undefined,
  defaults: { executionMode: ExecutionMode },
): RunExecutionOptions {
  return {
    executionMode: input?.executionMode || defaults.executionMode,
    guardrailProfile: input?.guardrailProfile || 'strict',
    rollbackWindowMinutes: Math.max(
      1,
      Math.min(1440, Math.trunc(input?.rollbackWindowMinutes ?? 60)),
    ),
    idempotencyKey:
      typeof input?.idempotencyKey === 'string' && input.idempotencyKey.length >= 8
        ? input.idempotencyKey
        : undefined,
    rollbackOnFailure:
      typeof input?.rollbackOnFailure === 'boolean'
        ? input.rollbackOnFailure
        : false,
  };
}

export const apiClient = {
  getMoneyPulse() {
    return request<MoneyPulse>('/workflow/v1/money-pulse');
  },

  getNarrativePulse() {
    return request<NarrativePulse>('/workflow/v1/narrative-pulse');
  },

  getRuntimeMetrics() {
    return request<RuntimeMetrics>('/workflow/v1/runtime-metrics');
  },

  getOpsActivityPipelineStatus() {
    return request<OpsActivityPipelineStatus>(
      '/workflow/v1/ops-activity-pipeline-status',
    );
  },

  resolveNextAction() {
    return request<{ id: string; title: string; route: string; confidence: number }>(
      '/workflow/v1/resolve-next-action',
      {
        method: 'POST',
        body: JSON.stringify({ envelope: commandEnvelope('resolve-next-action') }),
      },
    );
  },

  getFocusPanel() {
    return request<FocusPanel>('/focus/v1/adaptive-panel');
  },

  listPlaybooks() {
    return request<Playbook[]>('/workflow/v1/playbooks');
  },

  createPlaybook(name: string, commands: Array<Record<string, unknown>>) {
    return request<Playbook>('/workflow/v1/playbooks', {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: 'Created from Level-5 command center',
        commands,
      }),
    });
  },

  runPlaybook(playbookId: string, options?: Partial<RunExecutionOptions>) {
    const normalized = normalizeRunOptions(options, {
      executionMode: 'dry-run',
    });
    return request<PlaybookRun>(
      '/workflow/v1/run-playbook',
      {
        method: 'POST',
        body: JSON.stringify({
          envelope: commandEnvelope('run-playbook'),
          playbookId,
          ...normalized,
        }),
      },
    );
  },

  listPlaybookRuns(input?: {
    limit?: number;
    playbookId?: string;
    actorId?: string;
    sourceSurface?: string;
    executionMode?: ExecutionMode;
    status?: PlaybookRun['status'];
    idempotencyKey?: string;
    hasErrors?: boolean;
  }) {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(input?.limit ?? 20, 200))));
    if (input?.playbookId) {
      params.set('playbookId', input.playbookId);
    }
    if (input?.actorId) {
      params.set('actorId', input.actorId);
    }
    if (input?.sourceSurface) {
      params.set('sourceSurface', input.sourceSurface);
    }
    if (typeof input?.executionMode === 'string') {
      params.set('executionMode', input.executionMode);
    }
    if (typeof input?.status === 'string') {
      params.set('status', input.status);
    }
    if (input?.idempotencyKey) {
      params.set('idempotencyKey', input.idempotencyKey);
    }
    if (typeof input?.hasErrors === 'boolean') {
      params.set('hasErrors', String(input.hasErrors));
    }
    return request<PlaybookRun[]>(`/workflow/v1/playbook-runs?${params.toString()}`);
  },

  replayPlaybookRun(runId: string, options?: Partial<RunExecutionOptions>) {
    const normalized = normalizeRunOptions(options, {
      executionMode: 'dry-run',
    });
    return request<PlaybookRun>('/workflow/v1/replay-playbook-run', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('replay-playbook-run'),
        runId,
        ...normalized,
      }),
    });
  },

  runCloseRoutine(period: 'weekly' | 'monthly') {
    return request<CloseRun>(
      '/workflow/v1/run-close-routine',
      {
        method: 'POST',
        body: JSON.stringify({
          envelope: commandEnvelope('run-close-routine'),
          period,
        }),
      },
    );
  },

  listCloseRuns(input?: {
    limit?: number;
    period?: 'weekly' | 'monthly';
    hasExceptions?: boolean;
  }) {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(input?.limit ?? 30, 200))));
    if (input?.period) {
      params.set('period', input.period);
    }
    if (typeof input?.hasExceptions === 'boolean') {
      params.set('hasExceptions', String(input.hasExceptions));
    }
    return request<CloseRun[]>(`/workflow/v1/close-runs?${params.toString()}`);
  },

  executeCommandChain(
    chain: string,
    assignee = 'delegate',
    options?: Partial<RunExecutionOptions>,
  ) {
    const normalized = normalizeRunOptions(options, {
      executionMode: 'live',
    });
    return request<WorkflowCommandExecution>('/workflow/v1/execute-chain', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('execute-chain'),
        chain,
        assignee,
        ...normalized,
      }),
    });
  },

  listCommandRuns(input?: {
    limit?: number;
    actorId?: string;
    sourceSurface?: string;
    executionMode?: ExecutionMode;
    status?: WorkflowCommandExecution['status'];
    idempotencyKey?: string;
    hasErrors?: boolean;
  }) {
    const limit = input?.limit ?? 20;
    const clamped = Math.max(1, Math.min(limit, 200));
    const params = new URLSearchParams();
    params.set('limit', String(clamped));
    if (input?.actorId) {
      params.set('actorId', input.actorId);
    }
    if (input?.sourceSurface) {
      params.set('sourceSurface', input.sourceSurface);
    }
    if (typeof input?.executionMode === 'string') {
      params.set('executionMode', input.executionMode);
    }
    if (typeof input?.status === 'string') {
      params.set('status', input.status);
    }
    if (input?.idempotencyKey) {
      params.set('idempotencyKey', input.idempotencyKey);
    }
    if (typeof input?.hasErrors === 'boolean') {
      params.set('hasErrors', String(input.hasErrors));
    }
    return request<WorkflowCommandExecution[]>(
      `/workflow/v1/command-runs?${params.toString()}`,
    );
  },

  listCommandRunsByIds(runIds: string[]) {
    const normalized = Array.from(
      new Set(
        runIds
          .map(runId => runId.trim())
          .filter(runId => runId.length > 0),
      ),
    ).slice(0, 200);

    if (normalized.length === 0) {
      return Promise.resolve([]);
    }

    return request<WorkflowCommandExecution[]>('/workflow/v1/list-command-runs-by-ids', {
      method: 'POST',
      body: JSON.stringify({
        runIds: normalized,
      }),
    });
  },

  rollbackPlaybookRun(runId: string, reason?: string) {
    return request<PlaybookRun>('/workflow/v1/rollback-playbook-run', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('rollback-playbook-run'),
        runId,
        reason,
      }),
    });
  },

  rollbackCommandRun(runId: string, reason?: string) {
    return request<WorkflowCommandExecution>('/workflow/v1/rollback-command-run', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('rollback-command-run'),
        runId,
        reason,
      }),
    });
  },

  listOpsActivity(input?: {
    limit?: number;
    kinds?: OpsActivityKind[];
    severities?: OpsActivitySeverity[];
    cursor?: string;
  }) {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(input?.limit ?? 60, 250))));
    if (input?.kinds && input.kinds.length > 0) {
      params.set('kinds', input.kinds.join(','));
    }
    if (input?.severities && input.severities.length > 0) {
      params.set('severities', input.severities.join(','));
    }
    if (input?.cursor) {
      params.set('cursor', input.cursor);
    }
    return request<OpsActivityListResult>(
      `/workflow/v1/ops-activity?${params.toString()}`,
    );
  },

  backfillOpsActivity(limitPerPlane = 500) {
    return request<OpsBackfillResult>('/workflow/v1/backfill-ops-activity', {
      method: 'POST',
      body: JSON.stringify({
        limitPerPlane: Math.max(1, Math.min(limitPerPlane, 5000)),
      }),
    });
  },

  runOpsActivityMaintenance(input?: {
    retentionDays?: number;
    maxRows?: number;
  }) {
    return request<OpsMaintenanceResult>(
      '/workflow/v1/run-ops-activity-maintenance',
      {
        method: 'POST',
        body: JSON.stringify({
          retentionDays:
            typeof input?.retentionDays === 'number'
              ? Math.max(0, input.retentionDays)
              : 90,
          maxRows:
            typeof input?.maxRows === 'number'
              ? Math.max(0, Math.trunc(input.maxRows))
              : 50000,
        }),
      },
    );
  },

  requeueExpiredQueueJobs(limit = 100) {
    return request<QueueRequeueExpiredResult>(
      '/workflow/v1/requeue-expired-queue-jobs',
      {
        method: 'POST',
        headers: gatewayInternalToken
          ? {
              'x-finance-internal-token': gatewayInternalToken,
            }
          : undefined,
        body: JSON.stringify({
          limit: Math.max(1, Math.min(1000, Math.trunc(limit))),
        }),
      },
    );
  },

  listWorkerDeadLetters(input?: {
    limit?: number;
    status?: WorkerDeadLetter['status'];
    workerId?: string;
    jobName?: string;
  }) {
    return request<WorkerDeadLetter[]>('/workflow/v1/list-worker-dead-letters', {
      method: 'POST',
      headers: gatewayInternalToken
        ? {
            'x-finance-internal-token': gatewayInternalToken,
          }
        : undefined,
      body: JSON.stringify({
        limit: Math.max(1, Math.min(200, Math.trunc(input?.limit ?? 20))),
        status: input?.status,
        workerId: input?.workerId,
        jobName: input?.jobName,
      }),
    });
  },

  replayWorkerDeadLetters(input?: {
    deadLetterIds?: string[];
    limit?: number;
    maxAttempt?: number;
    jobName?: string;
    operatorId?: string;
  }) {
    return request<ReplayWorkerDeadLettersResult>(
      '/workflow/v1/replay-worker-dead-letters',
      {
        method: 'POST',
        headers: gatewayInternalToken
          ? {
              'x-finance-internal-token': gatewayInternalToken,
            }
          : undefined,
        body: JSON.stringify({
          deadLetterIds: input?.deadLetterIds,
          limit:
            typeof input?.limit === 'number'
              ? Math.max(1, Math.min(100, Math.trunc(input.limit)))
              : 20,
          maxAttempt:
            typeof input?.maxAttempt === 'number'
              ? Math.max(1, Math.min(20, Math.trunc(input.maxAttempt)))
              : 6,
          jobName: input?.jobName,
          operatorId: input?.operatorId || 'operator-replay',
        }),
      },
    );
  },

  resolveWorkerDeadLetter(input: {
    deadLetterId: string;
    operatorId?: string;
    resolutionNote?: string;
  }) {
    return request<WorkerDeadLetter>('/workflow/v1/resolve-worker-dead-letter', {
      method: 'POST',
      headers: gatewayInternalToken
        ? {
            'x-finance-internal-token': gatewayInternalToken,
          }
        : undefined,
      body: JSON.stringify({
        deadLetterId: input.deadLetterId,
        operatorId: input.operatorId || 'operator',
        resolutionNote: input.resolutionNote,
      }),
    });
  },

  reopenWorkerDeadLetter(input: {
    deadLetterId: string;
    operatorId?: string;
    note?: string;
  }) {
    return request<WorkerDeadLetter>('/workflow/v1/reopen-worker-dead-letter', {
      method: 'POST',
      headers: gatewayInternalToken
        ? {
            'x-finance-internal-token': gatewayInternalToken,
          }
        : undefined,
      body: JSON.stringify({
        deadLetterId: input.deadLetterId,
        operatorId: input.operatorId || 'operator',
        note: input.note,
      }),
    });
  },

  getWorkerQueueHealth(input?: {
    windowMs?: number;
    sampleLimit?: number;
    workerId?: string;
    jobName?: string;
  }) {
    return request<WorkerQueueHealth>('/workflow/v1/worker-queue-health', {
      method: 'POST',
      headers: gatewayInternalToken
        ? {
            'x-finance-internal-token': gatewayInternalToken,
          }
        : undefined,
      body: JSON.stringify({
        windowMs:
          typeof input?.windowMs === 'number'
            ? Math.max(60_000, Math.min(604_800_000, Math.trunc(input.windowMs)))
            : 3_600_000,
        sampleLimit:
          typeof input?.sampleLimit === 'number'
            ? Math.max(1, Math.min(20_000, Math.trunc(input.sampleLimit)))
            : 5_000,
        workerId: input?.workerId,
        jobName: input?.jobName,
      }),
    });
  },

  startOpsActivityPipeline(input?: {
    runBackfill?: boolean;
    runMaintenance?: boolean;
    limitPerPlane?: number;
    retentionDays?: number;
    maxRows?: number;
    waitForCompletion?: boolean;
  }) {
    return request<OpsActivityPipelineStartResult>(
      '/workflow/v1/start-ops-activity-pipeline',
      {
        method: 'POST',
        body: JSON.stringify({
          runBackfill: input?.runBackfill ?? true,
          runMaintenance: input?.runMaintenance ?? true,
          limitPerPlane:
            typeof input?.limitPerPlane === 'number'
              ? Math.max(1, Math.min(5000, Math.trunc(input.limitPerPlane)))
              : 500,
          retentionDays:
            typeof input?.retentionDays === 'number'
              ? Math.max(0, input.retentionDays)
              : 90,
          maxRows:
            typeof input?.maxRows === 'number'
              ? Math.max(0, Math.trunc(input.maxRows))
              : 50000,
          waitForCompletion: input?.waitForCompletion ?? false,
        }),
      },
    );
  },

  listDelegateLanes(input?: {
    limit?: number;
    status?: DelegateLane['status'];
    assignee?: string;
    assignedBy?: string;
    priority?: DelegateLane['priority'];
  }) {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(input?.limit ?? 50, 200))));
    if (input?.status) {
      params.set('status', input.status);
    }
    if (input?.assignee) {
      params.set('assignee', input.assignee);
    }
    if (input?.assignedBy) {
      params.set('assignedBy', input.assignedBy);
    }
    if (input?.priority) {
      params.set('priority', input.priority);
    }
    return request<DelegateLane[]>(`/delegate/v1/lanes?${params.toString()}`);
  },

  listDelegateLaneEvents(laneId: string, limit = 50) {
    const params = new URLSearchParams();
    params.set('laneId', laneId);
    params.set('limit', String(Math.max(1, Math.min(limit, 200))));
    return request<DelegateLaneEvent[]>(`/delegate/v1/lane-events?${params.toString()}`);
  },

  assignDelegateLane(
    title: string,
    assignee: string,
    options?: {
      priority?: DelegateLane['priority'];
      dueAtMs?: number;
      assignedBy?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return request<DelegateLane>('/delegate/v1/assign-lane', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('assign-lane'),
        title,
        assignee,
        assignedBy: options?.assignedBy || 'owner',
        priority: options?.priority || 'normal',
        dueAtMs: options?.dueAtMs,
        payload: {
          source: 'web-command-center',
          ...(options?.payload || {}),
        },
      }),
    });
  },

  acceptDelegateLane(laneId: string, message?: string) {
    return request<DelegateLane>('/delegate/v1/accept-lane', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('accept-lane'),
        laneId,
        message,
      }),
    });
  },

  completeDelegateLane(laneId: string, message?: string) {
    return request<DelegateLane>('/delegate/v1/complete-lane', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('complete-lane'),
        laneId,
        message,
      }),
    });
  },

  rejectDelegateLane(laneId: string, message?: string) {
    return request<DelegateLane>('/delegate/v1/reject-lane', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('reject-lane'),
        laneId,
        message,
      }),
    });
  },

  reopenDelegateLane(laneId: string, message?: string) {
    return request<DelegateLane>('/delegate/v1/reopen-lane', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('reopen-lane'),
        laneId,
        message,
      }),
    });
  },

  commentDelegateLane(
    laneId: string,
    message: string,
    payload?: Record<string, unknown>,
  ) {
    return request<DelegateLaneEvent>('/delegate/v1/comment-lane', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('comment-lane'),
        laneId,
        message,
        payload,
      }),
    });
  },

  compareScenario(primaryBranchId: string, againstBranchId?: string) {
    return request<ScenarioComparison>('/scenario/v1/compare-outcomes', {
      method: 'POST',
      body: JSON.stringify({
        branchId: primaryBranchId,
        againstBranchId,
      }),
    });
  },

  listScenarioBranches() {
    return request<ScenarioBranch[]>('/scenario/v1/branches');
  },

  listScenarioMutations(branchId: string) {
    const params = new URLSearchParams();
    params.set('branchId', branchId);
    return request<ScenarioMutation[]>(`/scenario/v1/mutations?${params.toString()}`);
  },

  getScenarioAdoptionCheck(branchId: string, againstBranchId?: string) {
    const params = new URLSearchParams();
    params.set('branchId', branchId);
    if (againstBranchId) {
      params.set('againstBranchId', againstBranchId);
    }
    return request<ScenarioAdoptionCheck | null>(
      `/scenario/v1/adoption-check?${params.toString()}`,
    );
  },

  getScenarioLineage(branchId: string) {
    const params = new URLSearchParams();
    params.set('branchId', branchId);
    return request<ScenarioLineage | null>(`/scenario/v1/lineage?${params.toString()}`);
  },

  createScenarioBranch(name: string, baseBranchId?: string, notes?: string) {
    return request<ScenarioBranch>('/scenario/v1/create-branch', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('create-scenario-branch'),
        name,
        baseBranchId,
        notes,
      }),
    });
  },

  applyScenarioMutation(
    branchId: string,
    mutationKind: string,
    payload: Record<string, unknown>,
  ) {
    return request<{ id: string; branchId: string; kind: string }>(
      '/scenario/v1/apply-mutation',
      {
        method: 'POST',
        body: JSON.stringify({
          envelope: commandEnvelope('apply-scenario-mutation'),
          branchId,
          mutationKind,
          payload,
        }),
      },
    );
  },

  simulateScenarioBranch(input: {
    label: string;
    chain: string;
    source: ScenarioSimulationSource;
    expectedImpact?: string;
    confidence?: number;
    amountDelta?: number;
    riskDelta?: number;
    preferredBaseBranchId?: string;
    notes?: string;
    recommendationId?: string;
  }) {
    return request<ScenarioSimulationResult>('/scenario/v1/simulate-branch', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('simulate-scenario-branch'),
        label: input.label,
        chain: input.chain,
        source: input.source,
        expectedImpact: input.expectedImpact,
        confidence: input.confidence,
        amountDelta: input.amountDelta,
        riskDelta: input.riskDelta,
        preferredBaseBranchId: input.preferredBaseBranchId,
        notes: input.notes,
        recommendationId: input.recommendationId,
      }),
    });
  },

  promoteScenarioBranchRun(input: {
    branchId: string;
    mutationId?: string;
    assignee?: string;
    sourceSurface?: string;
    note?: string;
    executionMode?: ExecutionMode;
    guardrailProfile?: GuardrailProfile;
    rollbackWindowMinutes?: number;
    idempotencyKey?: string;
    rollbackOnFailure?: boolean;
  }) {
    const normalized = normalizeRunOptions(
      {
        executionMode: input.executionMode,
        guardrailProfile: input.guardrailProfile,
        rollbackWindowMinutes: input.rollbackWindowMinutes,
        idempotencyKey: input.idempotencyKey,
        rollbackOnFailure: input.rollbackOnFailure,
      },
      {
        executionMode: 'live',
      },
    );

    return request<ScenarioBranchPromotionResult>('/scenario/v1/promote-branch-run', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('promote-scenario-branch-run'),
        branchId: input.branchId,
        mutationId: input.mutationId,
        assignee: input.assignee,
        sourceSurface: input.sourceSurface,
        note: input.note,
        ...normalized,
      }),
    });
  },

  adoptScenarioBranch(
    branchId: string,
    options?: { force?: boolean; againstBranchId?: string },
  ) {
    return request<ScenarioBranch>('/scenario/v1/adopt-branch', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('adopt-scenario-branch'),
        branchId,
        force: !!options?.force,
        againstBranchId: options?.againstBranchId,
      }),
    });
  },

  getRecommendations() {
    return request<AppRecommendation[]>('/intelligence/v1/recommend', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('recommend'),
      }),
    });
  },

  getTemporalSignals(input?: { bundesland?: string; horizonDays?: number }) {
    const params = new URLSearchParams();
    if (input?.bundesland) {
      params.set('bundesland', input.bundesland.toUpperCase());
    }
    if (typeof input?.horizonDays === 'number') {
      params.set(
        'horizonDays',
        String(Math.max(7, Math.min(45, Math.trunc(input.horizonDays)))),
      );
    }
    const query = params.toString();
    return request<TemporalSignals>(
      `/intelligence/v1/temporal-signals${query ? `?${query}` : ''}`,
    );
  },

  explainRecommendation(recommendation: AppRecommendation) {
    return request<{ explanation: string; confidence: number; reversible: boolean }>(
      '/intelligence/v1/explain',
      {
        method: 'POST',
        body: JSON.stringify({
          envelope: commandEnvelope('explain'),
          recommendation,
        }),
      },
    );
  },

  recordActionOutcome(actionId: string, outcome: string, notes?: string) {
    return request<ActionOutcome>('/focus/v1/record-action-outcome', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('record-action-outcome'),
        actionId,
        outcome,
        notes,
      }),
    });
  },

  listActionOutcomes(input?: { limit?: number; actionId?: string }) {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(input?.limit ?? 40, 200))));
    if (input?.actionId) {
      params.set('actionId', input.actionId);
    }
    return request<ActionOutcome[]>(`/focus/v1/action-outcomes?${params.toString()}`);
  },

  getEgressPolicy() {
    return request<EgressPolicy>('/policy/v1/egress-policy');
  },

  setEgressPolicy(policy: EgressPolicy) {
    return request<EgressPolicy>('/policy/v1/set-egress-policy', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('set-egress-policy'),
        policy,
      }),
    });
  },

  listEgressAudit(limit = 50) {
    return request<EgressAuditEntry[]>('/policy/v1/list-egress-audit', {
      method: 'POST',
      body: JSON.stringify({
        limit: Math.max(1, Math.min(limit, 200)),
      }),
    });
  },
};
