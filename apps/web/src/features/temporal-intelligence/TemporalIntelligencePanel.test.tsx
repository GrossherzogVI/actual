import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  TemporalSignals,
  WorkflowCommandExecution,
} from '../../core/types';
import { TemporalIntelligencePanel } from './TemporalIntelligencePanel';

const apiClientMock = vi.hoisted(() => ({
  getTemporalSignals: vi.fn(),
  executeCommandChain: vi.fn(),
  listScenarioBranches: vi.fn(),
  createScenarioBranch: vi.fn(),
  applyScenarioMutation: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createRun(
  overrides: Partial<WorkflowCommandExecution> = {},
): WorkflowCommandExecution {
  const now = Date.now();
  return {
    id: 'temporal-run-1',
    chain: 'triage -> close-safe -> refresh',
    steps: [
      {
        id: 'resolve-next-action',
        raw: 'triage',
        canonical: 'resolve-next',
        status: 'ok',
        detail: 'resolved next action',
        route: '/ops',
      },
    ],
    executionMode: 'dry-run',
    guardrailProfile: 'strict',
    status: 'completed',
    startedAtMs: now,
    finishedAtMs: now,
    rollbackWindowUntilMs: now + 60_000,
    rollbackEligible: true,
    rollbackOfRunId: undefined,
    statusTimeline: [
      { status: 'planned', atMs: now, note: 'Execution accepted.' },
      { status: 'running', atMs: now + 1, note: 'Execution started.' },
      { status: 'completed', atMs: now + 2, note: 'Execution completed.' },
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

function createTemporalSignals(
  overrides: Partial<TemporalSignals> = {},
): TemporalSignals {
  return {
    generatedAtMs: Date.now(),
    bundesland: 'BE',
    horizonDays: 14,
    nextBusinessDay: '2026-02-24',
    nextHolidayDate: '2026-03-08',
    calendar: [
      {
        date: '2026-02-24',
        weekday: 'Tue',
        isBusinessDay: true,
        isHoliday: false,
      },
      {
        date: '2026-02-25',
        weekday: 'Wed',
        isBusinessDay: true,
        isHoliday: false,
      },
    ],
    laneSignals: [
      {
        laneId: 'lane-1',
        title: 'Renegotiate mobile contract',
        assignee: 'delegate',
        priority: 'high',
        status: 'assigned',
        dueAtMs: Date.now() + 2 * 24 * 60 * 60 * 1000,
        deadlineDate: '2026-02-26',
        daysUntilDue: 2,
        severity: 'warn',
        reason: 'Deadline in 2 day(s).',
        recommendedChain: 'triage -> delegate-triage-batch -> apply-batch-policy',
      },
    ],
    recommendedChains: [
      {
        id: 'temporal-close-safe',
        label: 'Run safe close window',
        chain: 'triage -> close-safe -> refresh',
        reason: 'Next business-day execution window starts 2026-02-24.',
        amountDelta: 120,
        riskDelta: -2,
      },
      {
        id: 'temporal-delegate-batch',
        label: 'Batch delegate deadline triage',
        chain: 'triage -> delegate-triage-batch -> apply-batch-policy',
        reason: '1 warning lane needs coordinated action.',
        amountDelta: 80,
        riskDelta: -1,
      },
    ],
    summary: {
      critical: 0,
      warn: 1,
      info: 0,
      businessDays: 10,
      holidays: 1,
    },
    ...overrides,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onStatus = vi.fn();
  const onRoute = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <TemporalIntelligencePanel onStatus={onStatus} onRoute={onRoute} />
    </QueryClientProvider>,
  );

  return { onStatus, onRoute };
}

describe('TemporalIntelligencePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.getTemporalSignals.mockResolvedValue(createTemporalSignals());
    apiClientMock.executeCommandChain.mockResolvedValue(createRun());
    apiClientMock.listScenarioBranches.mockResolvedValue([
      {
        id: 'baseline-1',
        name: 'Baseline',
        status: 'adopted',
        createdAtMs: Date.now() - 10_000,
        updatedAtMs: Date.now() - 10_000,
        adoptedAtMs: Date.now() - 9_000,
      },
    ]);
    apiClientMock.createScenarioBranch.mockResolvedValue({
      id: 'branch-temporal-1',
      name: 'Run safe close window 2026-02-23',
      status: 'draft',
      baseBranchId: 'baseline-1',
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });
    apiClientMock.applyScenarioMutation.mockResolvedValue({
      id: 'mutation-1',
      branchId: 'branch-temporal-1',
      kind: 'manual-adjustment',
    });
  });

  it('renders temporal summary and lane pressure cards', async () => {
    renderPanel();

    expect(await screen.findByText('Temporal Intelligence')).toBeInTheDocument();
    expect(await screen.findByText('Renegotiate mobile contract')).toBeInTheDocument();
    expect(screen.getAllByText('Run safe close window').length).toBeGreaterThan(0);
    expect(await screen.findByText('2026-03-08')).toBeInTheDocument();
  });

  it('executes selected temporal chain with configured run controls', async () => {
    const { onRoute } = renderPanel();

    await screen.findByRole('button', { name: 'Dry-run temporal chain' });

    fireEvent.change(screen.getByLabelText('temporal execution mode'), {
      target: { value: 'live' },
    });
    fireEvent.change(screen.getByLabelText('temporal guardrail profile'), {
      target: { value: 'balanced' },
    });
    fireEvent.change(screen.getByLabelText('temporal rollback window'), {
      target: { value: '45' },
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Execute live temporal chain' }),
    );

    await waitFor(() => {
      expect(apiClientMock.executeCommandChain).toHaveBeenCalledTimes(1);
    });

    expect(apiClientMock.executeCommandChain).toHaveBeenCalledWith(
      'triage -> close-safe -> refresh',
      'delegate',
      expect.objectContaining({
        executionMode: 'live',
        guardrailProfile: 'balanced',
        rollbackWindowMinutes: 45,
        rollbackOnFailure: true,
      }),
    );

    await waitFor(() => {
      expect(onRoute).toHaveBeenCalledWith('/ops');
    });
  });

  it('creates a simulation branch from selected temporal chain', async () => {
    const { onRoute } = renderPanel();

    await screen.findByRole('button', { name: 'Dry-run temporal chain' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Simulate chain in spatial twin' }),
    );

    await waitFor(() => {
      expect(apiClientMock.createScenarioBranch).toHaveBeenCalledTimes(1);
    });

    expect(apiClientMock.applyScenarioMutation).toHaveBeenCalledWith(
      'branch-temporal-1',
      'manual-adjustment',
      expect.objectContaining({
        amountDelta: 120,
        riskDelta: -2,
        source: 'temporal-intelligence',
        chain: 'triage -> close-safe -> refresh',
      }),
    );

    await waitFor(() => {
      expect(onRoute).toHaveBeenCalledWith('/ops#spatial-twin');
    });
  });
});
