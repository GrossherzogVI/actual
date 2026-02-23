import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AppRecommendation,
  WorkflowCommandExecution,
} from '../../core/types';

import { DecisionGraphPanel } from './DecisionGraphPanel';

const apiClientMock = vi.hoisted(() => ({
  explainRecommendation: vi.fn(),
  executeCommandChain: vi.fn(),
  createPlaybook: vi.fn(),
  recordActionOutcome: vi.fn(),
  simulateScenarioBranch: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createRecommendation(
  overrides: Partial<AppRecommendation> = {},
): AppRecommendation {
  return {
    id: 'rec-review-urgent',
    title: 'Prioritize urgent review queue',
    confidence: 0.92,
    provenance: 'focus-engine',
    expectedImpact: 'risk-reduction',
    reversible: true,
    rationale: '4 urgent review items can trigger immediate cashflow mistakes.',
    ...overrides,
  };
}

function createCommandRun(
  overrides: Partial<WorkflowCommandExecution> = {},
): WorkflowCommandExecution {
  const now = Date.now();
  return {
    id: 'decision-run',
    chain: 'triage -> open-review',
    steps: [
      {
        id: 'open-urgent-review',
        raw: 'open-review',
        canonical: 'open-review',
        status: 'ok',
        detail: 'Opened urgent review lane.',
        route: '/review?priority=urgent',
      },
    ],
    executionMode: 'dry-run',
    guardrailProfile: 'balanced',
    status: 'completed',
    startedAtMs: now,
    finishedAtMs: now + 20,
    rollbackWindowUntilMs: now + 60_000,
    rollbackEligible: true,
    rollbackOfRunId: undefined,
    statusTimeline: [
      { status: 'planned', atMs: now, note: 'Execution accepted.' },
      { status: 'running', atMs: now + 1, note: 'Execution started.' },
      { status: 'completed', atMs: now + 20, note: 'Execution completed.' },
    ],
    guardrailResults: [],
    effectSummaries: [],
    idempotencyKey: undefined,
    rollbackOnFailure: false,
    errorCount: 0,
    actorId: 'owner',
    sourceSurface: 'finance-os-web',
    executedAtMs: now,
    ...overrides,
  };
}

function renderPanel(recommendations: AppRecommendation[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const onStatus = vi.fn();
  const onRoute = vi.fn();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <DecisionGraphPanel
        recommendations={recommendations}
        onStatus={onStatus}
        onRoute={onRoute}
      />
    </QueryClientProvider>,
  );

  return {
    ...view,
    onStatus,
    onRoute,
  };
}

describe('DecisionGraphPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.explainRecommendation.mockResolvedValue({
      explanation: 'Recommendation explanation.',
      confidence: 0.92,
      reversible: true,
    });
    apiClientMock.executeCommandChain.mockResolvedValue(createCommandRun());
    apiClientMock.createPlaybook.mockResolvedValue({
      id: 'playbook-from-decision',
      name: 'Generated Playbook',
      description: 'generated',
      commands: [],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });
    apiClientMock.recordActionOutcome.mockResolvedValue({
      id: 'outcome-1',
      actionId: 'rec-review-urgent',
      outcome: 'accepted',
      recordedAtMs: Date.now(),
    });
    apiClientMock.simulateScenarioBranch.mockResolvedValue({
      branch: {
        id: 'scenario-generated',
        name: 'Decision branch',
        status: 'draft',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      },
      mutation: {
        id: 'mutation-generated',
        branchId: 'scenario-generated',
        kind: 'manual-adjustment',
        payload: {
          source: 'decision-graph',
        },
        createdAtMs: Date.now(),
      },
      amountDelta: 336,
      riskDelta: -2,
      source: 'decision-graph',
      chain: 'triage -> expiring<30d -> batch-renegotiate',
      simulatedAtMs: Date.now(),
      recommendationId: 'rec-contract-expiring',
      expectedImpact: 'cost-avoidance',
    });
  });

  it('executes mapped recommendation chain with selected execution controls', async () => {
    const recommendation = createRecommendation();
    const { onRoute } = renderPanel([recommendation]);

    await screen.findByText(/Recommendation explanation/i);

    fireEvent.change(
      screen.getByLabelText('decision rollback window minutes'),
      {
        target: { value: '90' },
      },
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Dry-run recommendation' }),
    );

    await waitFor(() => {
      expect(apiClientMock.executeCommandChain).toHaveBeenCalledWith(
        'triage -> open-review',
        'delegate',
        expect.objectContaining({
          executionMode: 'dry-run',
          guardrailProfile: 'balanced',
          rollbackWindowMinutes: 90,
          rollbackOnFailure: false,
        }),
      );
    });

    expect(onRoute).toHaveBeenCalledWith('/review?priority=urgent');
  });

  it('generates playbook from selected recommendation blueprint', async () => {
    const recommendation = createRecommendation({
      id: 'rec-contract-expiring',
      title: 'Review expiring contracts this week',
      expectedImpact: 'cost-avoidance',
    });
    renderPanel([recommendation]);

    await screen.findByText(/recommended chain/i);
    fireEvent.click(screen.getByRole('button', { name: 'Generate playbook' }));

    await waitFor(() => {
      expect(apiClientMock.createPlaybook).toHaveBeenCalledWith(
        'Recommendation: expiring contracts sweep',
        expect.arrayContaining([
          expect.objectContaining({ verb: 'open-expiring-contracts' }),
          expect.objectContaining({ verb: 'assign-expiring-contracts-lane' }),
        ]),
      );
    });
  });

  it('renders fallback empty state when no recommendations exist', () => {
    renderPanel([]);
    expect(
      screen.getByText('No recommendations available yet.'),
    ).toBeInTheDocument();
  });

  it('creates a scenario simulation from the selected recommendation', async () => {
    const recommendation = createRecommendation({
      id: 'rec-contract-expiring',
      title: 'Review expiring contracts this week',
      expectedImpact: 'cost-avoidance',
      confidence: 0.8,
    });
    const { onRoute } = renderPanel([recommendation]);

    await screen.findByText(/Recommendation explanation/i);

    fireEvent.click(
      screen.getByRole('button', { name: 'Simulate recommendation branch' }),
    );

    await waitFor(() => {
      expect(apiClientMock.simulateScenarioBranch).toHaveBeenCalledWith(
        expect.objectContaining({
          label: expect.stringContaining('Decision Review expiring contracts'),
          chain: 'triage -> expiring<30d -> batch-renegotiate',
          source: 'decision-graph',
          expectedImpact: 'cost-avoidance',
          confidence: 0.8,
          recommendationId: 'rec-contract-expiring',
          notes:
            'Generated from decision graph. Recommendation: rec-contract-expiring.',
        }),
      );
    });

    expect(onRoute).toHaveBeenCalledWith('/ops#spatial-twin');
  });
});
