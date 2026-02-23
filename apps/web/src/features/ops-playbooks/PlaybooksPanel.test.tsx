import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Playbook, PlaybookRun, WorkflowCommandExecution } from '../../core/types';
import { dispatchRunDetailsCommand } from '../runtime/run-details-commands';
import { PlaybooksPanel } from './PlaybooksPanel';

const apiClientMock = vi.hoisted(() => ({
  listPlaybooks: vi.fn(),
  listPlaybookRuns: vi.fn(),
  createPlaybook: vi.fn(),
  runPlaybook: vi.fn(),
  replayPlaybookRun: vi.fn(),
  executeCommandChain: vi.fn(),
  rollbackPlaybookRun: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createPlaybookRun(
  overrides: Partial<PlaybookRun> = {},
): PlaybookRun {
  const now = Date.now();
  return {
    id: 'playbook-run',
    playbookId: 'playbook-1',
    chain: 'triage -> open-review',
    executionMode: 'dry-run',
    guardrailProfile: 'strict',
    status: 'completed',
    startedAtMs: now,
    finishedAtMs: now + 1000,
    rollbackWindowUntilMs: now + 60_000,
    rollbackEligible: false,
    rollbackOfRunId: undefined,
    statusTimeline: [
      { status: 'planned', atMs: now, note: 'Execution accepted.' },
      { status: 'running', atMs: now + 1, note: 'Execution started.' },
      { status: 'completed', atMs: now + 1000, note: 'Execution completed.' },
    ],
    guardrailResults: [],
    effectSummaries: [],
    idempotencyKey: undefined,
    rollbackOnFailure: false,
    executedSteps: 2,
    errorCount: 0,
    actorId: 'owner',
    sourceSurface: 'finance-os-web',
    steps: [],
    createdAtMs: now,
    ...overrides,
  };
}

function createPreviewRun(
  overrides: Partial<WorkflowCommandExecution> = {},
): WorkflowCommandExecution {
  const now = Date.now();
  return {
    id: 'preview-run',
    chain: 'triage -> open-review',
    steps: [
      {
        id: 'resolve-next-action',
        raw: 'triage',
        canonical: 'resolve-next',
        status: 'ok',
        detail: 'resolved',
        route: '/ops',
      },
    ],
    executionMode: 'dry-run',
    guardrailProfile: 'strict',
    status: 'completed',
    startedAtMs: now,
    finishedAtMs: now,
    rollbackWindowUntilMs: undefined,
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

  return render(
    <QueryClientProvider client={queryClient}>
      <PlaybooksPanel onStatus={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('PlaybooksPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const playbooks: Playbook[] = [
      {
        id: 'playbook-1',
        name: 'Morning Loop',
        description: 'Contract pressure + close',
        commands: [{ verb: 'resolve-next-action' }],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      },
    ];

    apiClientMock.listPlaybooks.mockResolvedValue(playbooks);
    apiClientMock.listPlaybookRuns.mockResolvedValue([
      createPlaybookRun({
        id: 'run-blocked',
        status: 'blocked',
        executionMode: 'live',
        rollbackEligible: false,
      }),
      createPlaybookRun({
        id: 'run-failed',
        status: 'failed',
        executionMode: 'live',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 60_000,
        errorCount: 1,
      }),
      createPlaybookRun({
        id: 'run-rolled',
        status: 'rolled_back',
        executionMode: 'live',
        rollbackEligible: false,
      }),
    ]);
    apiClientMock.createPlaybook.mockResolvedValue(playbooks[0]);
    apiClientMock.runPlaybook.mockResolvedValue(createPlaybookRun());
    apiClientMock.replayPlaybookRun.mockResolvedValue(createPlaybookRun());
    apiClientMock.executeCommandChain.mockResolvedValue(createPreviewRun());
    apiClientMock.rollbackPlaybookRun.mockResolvedValue(
      createPlaybookRun({
        id: 'rollback-run',
        status: 'completed',
      }),
    );
  });

  it('sends execution controls to live playbook runs', async () => {
    renderPanel();

    await screen.findByText('Morning Loop');

    fireEvent.change(screen.getByLabelText('playbook rollback window minutes'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByLabelText('playbook rollback on failure'));
    fireEvent.change(screen.getByLabelText('playbook idempotency key'), {
      target: { value: 'playbook-key-001' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Execute Live' }));

    await waitFor(() => {
      expect(apiClientMock.runPlaybook).toHaveBeenCalledTimes(1);
    });

    expect(apiClientMock.runPlaybook).toHaveBeenCalledWith(
      'playbook-1',
      expect.objectContaining({
        executionMode: 'live',
        guardrailProfile: 'strict',
        rollbackWindowMinutes: 45,
        rollbackOnFailure: true,
        idempotencyKey: 'playbook-key-001',
      }),
    );
  });

  it('renders run statuses and only enables rollback for eligible terminal runs', async () => {
    renderPanel();

    await screen.findByText(/status: blocked/i);
    expect(screen.getByText(/status: failed/i)).toBeInTheDocument();
    expect(screen.getByText(/status: rolled_back/i)).toBeInTheDocument();
    expect(screen.getAllByText(/status path:/i).length).toBeGreaterThan(0);

    const rollbackButtons = screen.getAllByRole('button', { name: 'Rollback' });
    expect(rollbackButtons).toHaveLength(3);
    expect(rollbackButtons[0]).toBeDisabled();
    expect(rollbackButtons[1]).toBeEnabled();
    expect(rollbackButtons[2]).toBeDisabled();

    fireEvent.click(rollbackButtons[1]!);

    await waitFor(() => {
      expect(apiClientMock.rollbackPlaybookRun).toHaveBeenCalledWith('run-failed');
    });
  });

  it('opens run details drawer and rolls back eligible run from drawer', async () => {
    apiClientMock.listPlaybookRuns.mockResolvedValue([
      createPlaybookRun({
        id: 'run-detail',
        status: 'failed',
        executionMode: 'live',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 120_000,
        errorCount: 1,
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
      expect(apiClientMock.rollbackPlaybookRun).toHaveBeenCalledWith('run-detail');
    });
  });

  it('opens latest failed playbook run details from run-details command event', async () => {
    apiClientMock.listPlaybookRuns.mockResolvedValue([
      createPlaybookRun({
        id: 'event-playbook-failed',
        status: 'failed',
        executionMode: 'live',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 120_000,
      }),
    ]);

    renderPanel();

    dispatchRunDetailsCommand({
      scope: 'playbook',
      selector: 'latest-failed',
      source: 'palette',
    });

    expect(
      await screen.findByRole('dialog', { name: 'Run details drawer' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/event-playbook-failed/i)).toBeInTheDocument();
  });
});
