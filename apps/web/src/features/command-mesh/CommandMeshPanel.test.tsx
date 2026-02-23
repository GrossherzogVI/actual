import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkflowCommandExecution } from '../../core/types';
import { dispatchRunDetailsCommand } from '../runtime/run-details-commands';
import { CommandMeshPanel } from './CommandMeshPanel';

const apiClientMock = vi.hoisted(() => ({
  listCommandRuns: vi.fn(),
  executeCommandChain: vi.fn(),
  rollbackCommandRun: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createCommandRun(
  overrides: Partial<WorkflowCommandExecution> = {},
): WorkflowCommandExecution {
  const now = Date.now();
  return {
    id: 'command-run-1',
    chain: 'triage -> open-review',
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
    rollbackEligible: false,
    rollbackOfRunId: undefined,
    statusTimeline: [
      { status: 'planned', atMs: now, note: 'Execution accepted.' },
      { status: 'running', atMs: now, note: 'Execution started.' },
      { status: 'completed', atMs: now, note: 'Execution completed.' },
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

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const onRoute = vi.fn();
  const onStatus = vi.fn();

  const view = render(
    <QueryClientProvider client={queryClient}>
      <CommandMeshPanel onRoute={onRoute} onStatus={onStatus} />
    </QueryClientProvider>,
  );

  return {
    ...view,
    onRoute,
    onStatus,
  };
}

describe('CommandMeshPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.listCommandRuns.mockResolvedValue([]);
    apiClientMock.executeCommandChain.mockResolvedValue(
      createCommandRun({
        id: 'blocked-run',
        executionMode: 'live',
        status: 'blocked',
        errorCount: 1,
        guardrailResults: [
          {
            ruleId: 'delegate-sensitive-steps',
            severity: 'critical',
            passed: false,
            message: 'Delegate actor attempted sensitive financial step(s).',
            blocking: true,
          },
        ],
        steps: [
          {
            id: 'guardrail-block',
            raw: 'close -> weekly',
            canonical: 'guardrail-block',
            status: 'error',
            detail: 'Blocked by guardrail policy.',
          },
        ],
      }),
    );
    apiClientMock.rollbackCommandRun.mockResolvedValue(
      createCommandRun({
        id: 'rollback-run',
        executionMode: 'live',
        status: 'completed',
      }),
    );
  });

  it('passes execution options to command chain execution and renders guardrail blocks', async () => {
    renderPanel();

    fireEvent.change(screen.getByLabelText('command rollback window minutes'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByLabelText('command rollback on failure'));
    fireEvent.change(screen.getByPlaceholderText('idempotency key (optional, 8-128 chars)'), {
      target: { value: 'command-key-001' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));

    await waitFor(() => {
      expect(apiClientMock.executeCommandChain).toHaveBeenCalledTimes(1);
    });

    expect(apiClientMock.executeCommandChain).toHaveBeenCalledWith(
      'triage -> close-weekly',
      'delegate',
      expect.objectContaining({
        executionMode: 'dry-run',
        guardrailProfile: 'strict',
        rollbackWindowMinutes: 30,
        rollbackOnFailure: true,
        idempotencyKey: 'command-key-001',
      }),
    );

    expect(await screen.findByText('Guardrail blocks')).toBeInTheDocument();
    expect(screen.getByText('delegate-sensitive-steps')).toBeInTheDocument();
  });

  it('rolls back the latest eligible live command run', async () => {
    apiClientMock.listCommandRuns.mockResolvedValue([
      createCommandRun({
        id: 'eligible-live-run',
        executionMode: 'live',
        status: 'failed',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 60_000,
      }),
    ]);

    renderPanel();

    const rollbackButton = await screen.findByRole('button', {
      name: 'Rollback latest live chain',
    });
    await waitFor(() => {
      expect(rollbackButton).toBeEnabled();
    });

    fireEvent.click(rollbackButton);

    await waitFor(() => {
      expect(apiClientMock.rollbackCommandRun).toHaveBeenCalledWith(
        'eligible-live-run',
        'rollback-latest-live-chain',
      );
    });
  });

  it('renders command run history guardrail and effect summaries', async () => {
    apiClientMock.listCommandRuns.mockResolvedValue([
      createCommandRun({
        id: 'history-run-1',
        executionMode: 'live',
        status: 'failed',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 120_000,
        guardrailResults: [
          {
            ruleId: 'urgent-review-threshold',
            severity: 'warn',
            passed: false,
            message: 'Urgent reviews exceed threshold.',
            blocking: false,
          },
        ],
        effectSummaries: [
          {
            effectId: 'effect-1',
            kind: 'navigation.open-review',
            description: 'Opened review lane',
            reversible: true,
            status: 'applied',
            metadata: {},
          },
        ],
      }),
    ]);

    renderPanel();

    expect(await screen.findByText(/guardrails:/i)).toBeInTheDocument();
    expect(screen.getByText(/status path: planned -> running ->/i)).toBeInTheDocument();
    expect(screen.getByText(/urgent-review-threshold:fail/i)).toBeInTheDocument();
    expect(screen.getByText(/effects:/i)).toBeInTheDocument();
    expect(screen.getByText(/navigation\.open-review:applied/i)).toBeInTheDocument();
  });

  it('opens run details drawer and allows rollback from drawer', async () => {
    apiClientMock.listCommandRuns.mockResolvedValue([
      createCommandRun({
        id: 'detail-run',
        executionMode: 'live',
        status: 'failed',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 120_000,
        guardrailResults: [
          {
            ruleId: 'urgent-review-threshold',
            severity: 'warn',
            passed: false,
            message: 'Urgent reviews exceed threshold.',
            blocking: false,
          },
        ],
        effectSummaries: [
          {
            effectId: 'effect-1',
            kind: 'navigation.open-review',
            description: 'Opened review lane',
            reversible: true,
            status: 'applied',
            metadata: {},
          },
        ],
      }),
    ]);

    renderPanel();

    const detailsButton = await screen.findByRole('button', { name: 'Details' });
    fireEvent.click(detailsButton);

    expect(
      await screen.findByRole('dialog', { name: 'Run details drawer' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Status timeline')).toBeInTheDocument();
    expect(screen.getByText('Guardrails')).toBeInTheDocument();
    expect(screen.getByText('Effects')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Rollback from details' }));

    await waitFor(() => {
      expect(apiClientMock.rollbackCommandRun).toHaveBeenCalledWith(
        'detail-run',
        'rollback-from-command-drawer',
      );
    });
  });

  it('opens latest failed run details from run-details command event', async () => {
    apiClientMock.listCommandRuns.mockResolvedValue([
      createCommandRun({
        id: 'event-failed-run',
        executionMode: 'live',
        status: 'failed',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 60_000,
      }),
    ]);

    renderPanel();

    dispatchRunDetailsCommand({
      scope: 'command',
      selector: 'latest-failed',
      source: 'palette',
    });

    expect(
      await screen.findByRole('dialog', { name: 'Run details drawer' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/event-failed-run/i)).toBeInTheDocument();
  });
});
