import { createCommandEnvelope } from '@finance-os/domain-kernel';

import type {
  ActionOutcome,
  AppRecommendation,
  CloseRun,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  EgressPolicy,
  FocusPanel,
  MoneyPulse,
  NarrativePulse,
  OpsActivityEvent,
  OpsActivityKind,
  OpsActivitySeverity,
  Playbook,
  PlaybookRun,
  ScenarioAdoptionCheck,
  ScenarioBranch,
  ScenarioComparison,
  ScenarioLineage,
  ScenarioMutation,
  WorkflowCommandExecution,
} from '../types';

const gatewayBaseUrl = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:7070';

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

export const apiClient = {
  getMoneyPulse() {
    return request<MoneyPulse>('/workflow/v1/money-pulse');
  },

  getNarrativePulse() {
    return request<NarrativePulse>('/workflow/v1/narrative-pulse');
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

  runPlaybook(playbookId: string, dryRun = true) {
    return request<PlaybookRun>(
      '/workflow/v1/run-playbook',
      {
        method: 'POST',
        body: JSON.stringify({
          envelope: commandEnvelope('run-playbook'),
          playbookId,
          dryRun,
        }),
      },
    );
  },

  listPlaybookRuns(input?: {
    limit?: number;
    playbookId?: string;
    actorId?: string;
    sourceSurface?: string;
    dryRun?: boolean;
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
    if (typeof input?.dryRun === 'boolean') {
      params.set('dryRun', String(input.dryRun));
    }
    if (typeof input?.hasErrors === 'boolean') {
      params.set('hasErrors', String(input.hasErrors));
    }
    return request<PlaybookRun[]>(`/workflow/v1/playbook-runs?${params.toString()}`);
  },

  replayPlaybookRun(runId: string, dryRun?: boolean) {
    return request<PlaybookRun>('/workflow/v1/replay-playbook-run', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('replay-playbook-run'),
        runId,
        dryRun,
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

  executeCommandChain(chain: string, assignee = 'delegate', dryRun = false) {
    return request<WorkflowCommandExecution>('/workflow/v1/execute-chain', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('execute-chain'),
        chain,
        assignee,
        dryRun,
      }),
    });
  },

  listCommandRuns(input?: {
    limit?: number;
    actorId?: string;
    sourceSurface?: string;
    dryRun?: boolean;
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
    if (typeof input?.dryRun === 'boolean') {
      params.set('dryRun', String(input.dryRun));
    }
    if (typeof input?.hasErrors === 'boolean') {
      params.set('hasErrors', String(input.hasErrors));
    }
    return request<WorkflowCommandExecution[]>(
      `/workflow/v1/command-runs?${params.toString()}`,
    );
  },

  listOpsActivity(input?: {
    limit?: number;
    kinds?: OpsActivityKind[];
    severities?: OpsActivitySeverity[];
  }) {
    const params = new URLSearchParams();
    params.set('limit', String(Math.max(1, Math.min(input?.limit ?? 60, 250))));
    if (input?.kinds && input.kinds.length > 0) {
      params.set('kinds', input.kinds.join(','));
    }
    if (input?.severities && input.severities.length > 0) {
      params.set('severities', input.severities.join(','));
    }
    return request<OpsActivityEvent[]>(`/workflow/v1/ops-activity?${params.toString()}`);
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
