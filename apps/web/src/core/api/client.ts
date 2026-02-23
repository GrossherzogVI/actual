import { createCommandEnvelope } from '@finance-os/domain-kernel';

import type {
  AppRecommendation,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  EgressPolicy,
  FocusPanel,
  MoneyPulse,
  Playbook,
  ScenarioBranch,
  ScenarioComparison,
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
    return request<{ id: string; dryRun: boolean; executedSteps: number }>(
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

  runCloseRoutine(period: 'weekly' | 'monthly') {
    return request<{ id: string; exceptionCount: number }>(
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

  adoptScenarioBranch(branchId: string) {
    return request<ScenarioBranch>('/scenario/v1/adopt-branch', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('adopt-scenario-branch'),
        branchId,
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
