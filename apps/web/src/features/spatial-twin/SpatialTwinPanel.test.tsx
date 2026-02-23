import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ScenarioAdoptionCheck,
  ScenarioBranch,
  ScenarioLineage,
  ScenarioMutation,
} from '../../core/types';
import { SpatialTwinPanel } from './SpatialTwinPanel';

const dispatchRunDetailsCommandMock = vi.hoisted(() => vi.fn());
const apiClientMock = vi.hoisted(() => ({
  listScenarioBranches: vi.fn(),
  compareScenario: vi.fn(),
  listScenarioMutations: vi.fn(),
  listCommandRuns: vi.fn(),
  listCommandRunsByIds: vi.fn(),
  getScenarioAdoptionCheck: vi.fn(),
  getScenarioLineage: vi.fn(),
  createScenarioBranch: vi.fn(),
  applyScenarioMutation: vi.fn(),
  adoptScenarioBranch: vi.fn(),
  promoteScenarioBranchRun: vi.fn(),
  rollbackCommandRun: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

vi.mock('../runtime/run-details-commands', () => ({
  dispatchRunDetailsCommand: dispatchRunDetailsCommandMock,
}));

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
      <SpatialTwinPanel onStatus={onStatus} onRoute={onRoute} />
    </QueryClientProvider>,
  );

  return {
    onStatus,
    onRoute,
  };
}

describe('SpatialTwinPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const now = Date.now();
    const branch: ScenarioBranch = {
      id: 'branch-1',
      name: 'Simulation Branch',
      status: 'draft',
      createdAtMs: now - 30_000,
      updatedAtMs: now - 10_000,
      baseBranchId: 'baseline-1',
      notes: 'seed',
    };
    const mutations: ScenarioMutation[] = [
      {
        id: 'mutation-1',
        branchId: branch.id,
        kind: 'manual-adjustment',
        payload: {
          amountDelta: 180,
          riskDelta: -2,
          source: 'command-mesh',
          chain: 'triage -> open-review',
        },
        createdAtMs: now - 5_000,
      },
      {
        id: 'mutation-promotion-1',
        branchId: branch.id,
        kind: 'run-promotion-link',
        payload: {
          sourceMutationId: 'mutation-1',
          source: 'manual',
          runId: 'run-1',
          runStatus: 'completed',
          runExecutionMode: 'live',
          promotedAtMs: now - 1_000,
        },
        createdAtMs: now - 1_000,
      },
    ];
    const adoptionCheck: ScenarioAdoptionCheck = {
      branchId: branch.id,
      againstBranchId: 'baseline-1',
      canAdopt: true,
      riskScore: 32,
      blockers: [],
      warnings: [],
      summary: 'Adoption ready with risk score 32.',
      comparison: {
        primaryBranchId: branch.id,
        againstBranchId: 'baseline-1',
        primary: { amountDelta: 180, riskDelta: -2 },
        against: { amountDelta: 0, riskDelta: 0 },
        diff: { amountDelta: 180, riskDelta: -2 },
      },
      mutationCount: 1,
      lineageDepth: 2,
      checkedAtMs: now,
    };
    const lineage: ScenarioLineage = {
      branchId: branch.id,
      hasCycle: false,
      nodes: [
        {
          branchId: 'baseline-1',
          name: 'Baseline',
          status: 'adopted',
          adoptedAtMs: now - 100_000,
        },
        {
          branchId: branch.id,
          name: branch.name,
          status: 'draft',
        },
      ],
    };

    apiClientMock.listScenarioBranches.mockResolvedValue([branch]);
    apiClientMock.compareScenario.mockResolvedValue({
      primaryBranchId: branch.id,
      againstBranchId: 'baseline-1',
      primary: { amountDelta: 180, riskDelta: -2 },
      against: { amountDelta: 0, riskDelta: 0 },
      diff: { amountDelta: 180, riskDelta: -2 },
    });
    apiClientMock.listScenarioMutations.mockResolvedValue(mutations);
    apiClientMock.listCommandRuns.mockResolvedValue([
      {
        id: 'run-1',
        chain: 'triage -> open-review',
        steps: [],
        executionMode: 'live',
        guardrailProfile: 'strict',
        status: 'completed',
        startedAtMs: now,
        finishedAtMs: now,
        rollbackWindowUntilMs: now + 60_000,
        rollbackEligible: true,
        rollbackOfRunId: undefined,
        statusTimeline: [
          { status: 'planned', atMs: now },
          { status: 'running', atMs: now + 1 },
          { status: 'completed', atMs: now + 2 },
        ],
        guardrailResults: [],
        effectSummaries: [],
        rollbackOnFailure: false,
        errorCount: 0,
        actorId: 'owner',
        sourceSurface: 'spatial-twin',
        executedAtMs: now,
      },
    ]);
    apiClientMock.listCommandRunsByIds.mockResolvedValue([]);
    apiClientMock.getScenarioAdoptionCheck.mockResolvedValue(adoptionCheck);
    apiClientMock.getScenarioLineage.mockResolvedValue(lineage);
    apiClientMock.createScenarioBranch.mockResolvedValue(branch);
    apiClientMock.applyScenarioMutation.mockResolvedValue(mutations[0]);
    apiClientMock.adoptScenarioBranch.mockResolvedValue({
      ...branch,
      status: 'adopted',
      adoptedAtMs: now,
      updatedAtMs: now,
    });
    apiClientMock.promoteScenarioBranchRun.mockResolvedValue({
      branch,
      sourceMutation: mutations[0],
      promotionMutation: {
        id: 'mutation-promotion-1',
        branchId: branch.id,
        kind: 'run-promotion-link',
        payload: {
          sourceMutationId: 'mutation-1',
          runId: 'run-1',
        },
        createdAtMs: now,
      },
      run: {
        id: 'run-1',
        chain: 'triage -> open-review',
        steps: [],
        executionMode: 'live',
        guardrailProfile: 'strict',
        status: 'completed',
        startedAtMs: now,
        finishedAtMs: now,
        rollbackWindowUntilMs: now + 60_000,
        rollbackEligible: true,
        rollbackOfRunId: undefined,
        statusTimeline: [],
        guardrailResults: [],
        effectSummaries: [],
        rollbackOnFailure: false,
        errorCount: 0,
        actorId: 'owner',
        sourceSurface: 'spatial-twin',
        executedAtMs: now,
      },
      chain: 'triage -> open-review',
      promotedAtMs: now,
    });
    apiClientMock.rollbackCommandRun.mockResolvedValue({
      id: 'rollback-run-1',
      chain: 'rollback:run-1',
      steps: [],
      executionMode: 'live',
      guardrailProfile: 'off',
      status: 'completed',
      startedAtMs: now + 1_000,
      finishedAtMs: now + 1_000,
      rollbackWindowUntilMs: undefined,
      rollbackEligible: false,
      rollbackOfRunId: 'run-1',
      statusTimeline: [],
      guardrailResults: [],
      effectSummaries: [],
      rollbackOnFailure: false,
      errorCount: 0,
      actorId: 'owner',
      sourceSurface: 'spatial-twin',
      executedAtMs: now + 1_000,
    });
  });

  it('promotes selected simulation mutation into command run with execution controls', async () => {
    const { onRoute } = renderPanel();

    await screen.findByText('Promote Simulation');

    fireEvent.change(screen.getByLabelText('spatial twin rollback window minutes'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByLabelText('spatial twin rollback on failure'));
    fireEvent.change(screen.getByLabelText('spatial twin promotion assignee'), {
      target: { value: 'ops-delegate' },
    });
    fireEvent.change(screen.getByLabelText('spatial twin idempotency key'), {
      target: { value: 'spatial-idempotency-1' },
    });

    const promoteButton = screen.getByRole('button', { name: 'Promote to live run' });
    await waitFor(() => {
      expect(promoteButton).toBeEnabled();
    });

    fireEvent.click(promoteButton);

    await waitFor(() => {
      expect(apiClientMock.promoteScenarioBranchRun).toHaveBeenCalledWith(
        expect.objectContaining({
          branchId: 'branch-1',
          mutationId: 'mutation-1',
          assignee: 'ops-delegate',
          sourceSurface: 'spatial-twin',
          executionMode: 'live',
          guardrailProfile: 'strict',
          rollbackWindowMinutes: 45,
          rollbackOnFailure: true,
          idempotencyKey: 'spatial-idempotency-1',
        }),
      );
    });

    expect(onRoute).toHaveBeenCalledWith('/ops#command-mesh');
  });

  it('rolls back a promoted run from provenance lane', async () => {
    apiClientMock.listCommandRuns.mockResolvedValue([]);
    apiClientMock.listCommandRunsByIds.mockResolvedValue([
      {
        id: 'run-1',
        chain: 'triage -> open-review',
        steps: [],
        executionMode: 'live',
        guardrailProfile: 'strict',
        status: 'completed',
        startedAtMs: Date.now(),
        finishedAtMs: Date.now(),
        rollbackWindowUntilMs: Date.now() + 60_000,
        rollbackEligible: true,
        rollbackOfRunId: undefined,
        statusTimeline: [
          { status: 'planned', atMs: Date.now() },
          { status: 'running', atMs: Date.now() + 1 },
          { status: 'completed', atMs: Date.now() + 2 },
        ],
        guardrailResults: [],
        effectSummaries: [],
        rollbackOnFailure: false,
        errorCount: 0,
        actorId: 'owner',
        sourceSurface: 'spatial-twin',
        executedAtMs: Date.now(),
      },
    ]);
    renderPanel();

    await screen.findByText('Run Provenance');
    await waitFor(() => {
      expect(apiClientMock.listCommandRunsByIds).toHaveBeenCalledWith(['run-1']);
    });
    const rollbackButtons = await screen.findAllByRole('button', {
      name: 'Rollback promoted run',
    });
    const enabled = rollbackButtons.find(button => !button.hasAttribute('disabled'));
    expect(enabled).toBeDefined();
    if (!enabled) {
      return;
    }

    fireEvent.click(enabled);

    await waitFor(() => {
      expect(apiClientMock.rollbackCommandRun).toHaveBeenCalledWith(
        'run-1',
        'spatial-twin-promotion-rollback',
      );
    });
  });

  it('opens promoted run details in command mesh context', async () => {
    const { onRoute } = renderPanel();

    await screen.findByText('Run Provenance');
    const openButtons = await screen.findAllByRole('button', {
      name: 'Open run details',
    });
    const enabled = openButtons.find(button => !button.hasAttribute('disabled'));
    expect(enabled).toBeDefined();
    if (!enabled) {
      return;
    }

    fireEvent.click(enabled);

    expect(onRoute).toHaveBeenCalledWith('/ops#command-mesh');
    expect(dispatchRunDetailsCommandMock).toHaveBeenCalledWith({
      scope: 'command',
      runId: 'run-1',
      source: 'provenance',
    });
  });
});
