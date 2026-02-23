import { createCommandEnvelope } from '@finance-os/domain-kernel';

import type {
  AppRecommendation,
  DelegateLane,
  FocusPanel,
  MoneyPulse,
  Playbook,
  ScenarioComparison,
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

  listDelegateLanes() {
    return request<DelegateLane[]>('/delegate/v1/lanes');
  },

  assignDelegateLane(title: string, assignee: string) {
    return request<DelegateLane>('/delegate/v1/assign-lane', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('assign-lane'),
        title,
        assignee,
        assignedBy: 'owner',
        payload: {
          source: 'web-command-center',
        },
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

  getRecommendations() {
    return request<AppRecommendation[]>('/intelligence/v1/recommend', {
      method: 'POST',
      body: JSON.stringify({
        envelope: commandEnvelope('recommend'),
      }),
    });
  },
};
