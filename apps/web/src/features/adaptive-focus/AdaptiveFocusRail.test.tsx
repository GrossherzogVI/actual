import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FocusAction, FocusPanel, WorkflowCommandExecution } from '../../core/types';
import { AdaptiveFocusRail } from './AdaptiveFocusRail';

const apiClientMock = vi.hoisted(() => ({
  getFocusPanel: vi.fn(),
  listActionOutcomes: vi.fn(),
  recordActionOutcome: vi.fn(),
  resolveNextAction: vi.fn(),
  executeCommandChain: vi.fn(),
  simulateScenarioBranch: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createFocusPanel(actions: FocusAction[]): FocusPanel {
  return {
    actions,
    generatedAtMs: Date.now(),
  };
}

function createCommandRun(
  overrides: Partial<WorkflowCommandExecution> = {},
): WorkflowCommandExecution {
  const now = Date.now();
  return {
    id: 'focus-run',
    chain: 'triage -> refresh',
    steps: [
      {
        id: 'resolve-next-action',
        raw: 'triage',
        canonical: 'resolve-next',
        status: 'ok',
        detail: 'Resolved next action.',
        route: '/ops',
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

function renderRail() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onRoute = vi.fn();
  const onStatus = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <AdaptiveFocusRail onRoute={onRoute} onStatus={onStatus} />
    </QueryClientProvider>,
  );

  return { onRoute, onStatus };
}

describe('AdaptiveFocusRail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.listActionOutcomes.mockResolvedValue([]);
    apiClientMock.recordActionOutcome.mockResolvedValue({
      id: 'outcome-1',
      actionId: 'focus-urgent-review',
      outcome: 'accepted',
      recordedAtMs: Date.now(),
    });
    apiClientMock.resolveNextAction.mockResolvedValue({
      id: 'focus-urgent-review',
      title: 'Clear urgent review queue',
      route: '/review?priority=urgent',
      confidence: 0.9,
    });
    apiClientMock.executeCommandChain.mockResolvedValue(
      createCommandRun({
        chain: 'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
        executionMode: 'live',
        guardrailProfile: 'strict',
        steps: [
          {
            id: 'escalate-stale-lanes',
            raw: 'escalate-stale-lanes',
            canonical: 'escalate-stale-lanes',
            status: 'ok',
            detail: 'Escalated stale lanes.',
            route: '/ops#delegate-lanes',
          },
        ],
      }),
    );
    apiClientMock.simulateScenarioBranch.mockResolvedValue({
      branch: {
        id: 'focus-sim-branch',
        name: 'Focus simulation',
        status: 'draft',
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      },
      mutation: {
        id: 'focus-sim-mutation',
        branchId: 'focus-sim-branch',
        kind: 'manual-adjustment',
        payload: {
          source: 'adaptive-focus',
        },
        createdAtMs: Date.now(),
      },
      amountDelta: 188,
      riskDelta: -5,
      source: 'adaptive-focus',
      chain: 'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
      simulatedAtMs: Date.now(),
      expectedImpact: 'deadline-risk-control',
    });
  });

  it('executes mapped focus chain with selected run controls', async () => {
    apiClientMock.getFocusPanel.mockResolvedValue(
      createFocusPanel([
        {
          id: 'focus-delegate-lanes-stale',
          title: 'Nudge stale assigned delegate lanes',
          route: '/ops#delegate-lanes',
          score: 95,
          reason: 'Assigned lanes stale for 48h.',
        },
      ]),
    );
    const { onRoute } = renderRail();

    const staleLabels = await screen.findAllByText('Nudge stale assigned delegate lanes');
    expect(staleLabels.length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('focus execution mode'), {
      target: { value: 'live' },
    });
    fireEvent.change(screen.getByLabelText('focus guardrail profile'), {
      target: { value: 'strict' },
    });
    fireEvent.change(screen.getByLabelText('focus rollback window minutes'), {
      target: { value: '90' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Execute selected live' }));

    await waitFor(() => {
      expect(apiClientMock.executeCommandChain).toHaveBeenCalledWith(
        'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
        'delegate',
        expect.objectContaining({
          executionMode: 'live',
          guardrailProfile: 'strict',
          rollbackWindowMinutes: 90,
          rollbackOnFailure: true,
        }),
      );
    });
    expect(onRoute).toHaveBeenCalledWith('/ops#delegate-lanes');
  });

  it('uses refresh fallback chain for unknown focus actions', async () => {
    apiClientMock.getFocusPanel.mockResolvedValue(
      createFocusPanel([
        {
          id: 'focus-custom',
          title: 'Custom follow-up',
          route: '/ops#custom',
          score: 50,
          reason: 'Custom signal.',
        },
      ]),
    );
    apiClientMock.executeCommandChain.mockResolvedValue(
      createCommandRun({
        chain: 'triage -> refresh',
        steps: [
          {
            id: 'refresh',
            raw: 'refresh',
            canonical: 'refresh',
            status: 'ok',
            detail: 'Refreshed.',
          },
        ],
      }),
    );
    const { onRoute } = renderRail();

    const customLabels = await screen.findAllByText('Custom follow-up');
    expect(customLabels.length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Dry-run selected action' }));

    await waitFor(() => {
      expect(apiClientMock.executeCommandChain).toHaveBeenCalledWith(
        'triage -> refresh',
        'delegate',
        expect.objectContaining({
          executionMode: 'dry-run',
          guardrailProfile: 'balanced',
          rollbackWindowMinutes: 60,
          rollbackOnFailure: false,
        }),
      );
    });
    expect(onRoute).toHaveBeenCalledWith('/ops#custom');
  });

  it('prefers backend-provided recommended execution plans when available', async () => {
    apiClientMock.getFocusPanel.mockResolvedValue(
      createFocusPanel([
        {
          id: 'focus-custom',
          title: 'Backend planned action',
          route: '/ops#custom',
          score: 88,
          reason: 'Server synthesized plan.',
          recommendedChain: 'triage -> open-review -> apply-batch-policy',
          recommendedAssignee: 'delegate',
          recommendedExecutionMode: 'live',
          recommendedGuardrailProfile: 'off',
          recommendedRollbackWindowMinutes: 45,
        },
      ]),
    );
    apiClientMock.executeCommandChain.mockResolvedValue(
      createCommandRun({
        chain: 'triage -> open-review -> apply-batch-policy',
        executionMode: 'live',
        guardrailProfile: 'off',
      }),
    );
    renderRail();

    const labels = await screen.findAllByText('Backend planned action');
    expect(labels.length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Execute selected live' }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Execute selected live' }));

    await waitFor(() => {
      expect(apiClientMock.executeCommandChain).toHaveBeenCalledWith(
        'triage -> open-review -> apply-batch-policy',
        'delegate',
        expect.objectContaining({
          executionMode: 'live',
          guardrailProfile: 'off',
          rollbackWindowMinutes: 45,
          rollbackOnFailure: true,
        }),
      );
    });
  });

  it('simulates selected focus action in the spatial twin lane', async () => {
    apiClientMock.getFocusPanel.mockResolvedValue(
      createFocusPanel([
        {
          id: 'focus-delegate-lanes-stale',
          title: 'Nudge stale assigned delegate lanes',
          route: '/ops#delegate-lanes',
          score: 95,
          reason: 'Assigned lanes stale for 48h.',
          expectedImpact: 'deadline-risk-control',
        },
      ]),
    );
    const { onRoute } = renderRail();

    await screen.findAllByText('Nudge stale assigned delegate lanes');
    fireEvent.click(screen.getByRole('button', { name: 'Simulate selected in twin' }));

    await waitFor(() => {
      expect(apiClientMock.simulateScenarioBranch).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'Focus Nudge stale assigned delegate lanes',
          chain: 'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
          source: 'adaptive-focus',
          expectedImpact: 'deadline-risk-control',
          confidence: 0.95,
          notes:
            'Generated from adaptive focus action focus-delegate-lanes-stale.',
        }),
      );
    });

    expect(onRoute).toHaveBeenCalledWith('/ops#spatial-twin');
  });
});
