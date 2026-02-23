import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlaybookRun, WorkflowCommandExecution } from '../core/types';
import { App } from './App';

const dispatchRunDetailsCommandMock = vi.hoisted(() => vi.fn());
const dispatchRuntimeCommandMock = vi.hoisted(() => vi.fn());
const apiClientMock = vi.hoisted(() => ({
  getMoneyPulse: vi.fn(),
  getRecommendations: vi.fn(),
  getNarrativePulse: vi.fn(),
  listCommandRuns: vi.fn(),
  listPlaybookRuns: vi.fn(),
  runCloseRoutine: vi.fn(),
  createPlaybook: vi.fn(),
  assignDelegateLane: vi.fn(),
  resolveNextAction: vi.fn(),
  executeCommandChain: vi.fn(),
  rollbackPlaybookRun: vi.fn(),
  rollbackCommandRun: vi.fn(),
}));

vi.mock('@finance-os/design-system', () => ({
  CommandPaletteAdvanced: () => <div data-testid="command-palette" />,
  commandCenterTokens: {
    color: {
      border: '#294465',
    },
  },
}));

vi.mock('../core/api/client', () => ({
  apiClient: apiClientMock,
}));

vi.mock('../features/runtime/run-details-commands', () => ({
  dispatchRunDetailsCommand: dispatchRunDetailsCommandMock,
}));

vi.mock('../features/runtime/runtime-commands', () => ({
  dispatchRuntimeCommand: dispatchRuntimeCommandMock,
}));

vi.mock('../features/adaptive-focus/AdaptiveFocusRail', () => ({
  AdaptiveFocusRail: () => <section data-testid="adaptive-focus-rail" />,
}));

vi.mock('../features/close-loop/CloseLoopPanel', () => ({
  CloseLoopPanel: () => <section data-testid="close-loop-panel" />,
}));

vi.mock('../features/command-mesh/CommandMeshPanel', () => ({
  CommandMeshPanel: () => <section data-testid="command-mesh-panel" />,
}));

vi.mock('../features/decision-graph/DecisionGraphPanel', () => ({
  DecisionGraphPanel: () => <section data-testid="decision-graph-panel" />,
}));

vi.mock('../features/delegate-lanes/DelegateLanesPanel', () => ({
  DelegateLanesPanel: () => <section data-testid="delegate-lanes-panel" />,
}));

vi.mock('../features/ops-playbooks/PlaybooksPanel', () => ({
  PlaybooksPanel: () => <section data-testid="ops-playbooks-panel" />,
}));

vi.mock('../features/ops-activity/OpsActivityFeedPanel', () => ({
  OpsActivityFeedPanel: () => <section data-testid="ops-activity-panel" />,
}));

vi.mock('../features/policy/PolicyControlPanel', () => ({
  PolicyControlPanel: () => <section data-testid="policy-control-panel" />,
}));

vi.mock('../features/runtime/RuntimeIncidentTimelinePanel', () => ({
  RuntimeIncidentTimelinePanel: () => (
    <section data-testid="runtime-incident-timeline-panel" />
  ),
}));

vi.mock('../features/runtime/RuntimeControlPanel', () => ({
  RuntimeControlPanel: () => <section data-testid="runtime-control-panel" />,
}));

vi.mock('../features/spatial-twin/SpatialTwinPanel', () => ({
  SpatialTwinPanel: () => <section data-testid="spatial-twin-panel" />,
}));

function createCommandRun(
  overrides: Partial<WorkflowCommandExecution> = {},
): WorkflowCommandExecution {
  const now = Date.now();
  return {
    id: 'cmd-run',
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
    executionMode: 'live',
    guardrailProfile: 'strict',
    status: 'completed',
    startedAtMs: now,
    finishedAtMs: now + 10,
    rollbackWindowUntilMs: now + 60_000,
    rollbackEligible: true,
    rollbackOfRunId: undefined,
    statusTimeline: [
      { status: 'planned', atMs: now, note: 'Execution accepted.' },
      { status: 'running', atMs: now + 1, note: 'Execution started.' },
      { status: 'completed', atMs: now + 10, note: 'Execution completed.' },
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

function createPlaybookRun(overrides: Partial<PlaybookRun> = {}): PlaybookRun {
  const now = Date.now();
  return {
    id: 'playbook-run',
    playbookId: 'playbook-1',
    chain: 'triage -> open-review',
    executionMode: 'live',
    guardrailProfile: 'strict',
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
    executedSteps: 2,
    errorCount: 0,
    actorId: 'owner',
    sourceSurface: 'finance-os-web',
    steps: [],
    createdAtMs: now,
    ...overrides,
  };
}

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

describe('App anomaly rail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiClientMock.getMoneyPulse.mockResolvedValue({
      pendingReviews: 4,
      urgentReviews: 1,
      expiringContracts: 2,
      generatedAtMs: Date.now(),
    });
    apiClientMock.getRecommendations.mockResolvedValue([]);
    apiClientMock.getNarrativePulse.mockResolvedValue({
      summary: 'Pulse',
      highlights: [],
      actionHints: [],
      generatedAtMs: Date.now(),
    });
    apiClientMock.listCommandRuns.mockResolvedValue([]);
    apiClientMock.listPlaybookRuns.mockResolvedValue([]);
  });

  it('renders anomaly counts and opens blocked target from anomaly badge', async () => {
    apiClientMock.listCommandRuns.mockResolvedValue([
      createCommandRun({
        id: 'cmd-failed',
        status: 'failed',
        errorCount: 1,
        startedAtMs: 1_000,
      }),
    ]);
    apiClientMock.listPlaybookRuns.mockResolvedValue([
      createPlaybookRun({
        id: 'playbook-blocked',
        status: 'blocked',
        rollbackEligible: false,
        errorCount: 1,
        createdAtMs: 2_000,
      }),
    ]);

    renderApp();

    expect(await screen.findByText(/live sample:\s*2 runs/i)).toBeInTheDocument();
    const anomalyRail = screen
      .getByText(/live sample:\s*2 runs/i)
      .closest('nav');
    expect(anomalyRail).not.toBeNull();
    if (!anomalyRail) {
      return;
    }
    const blockedBadge = within(anomalyRail).getByRole('button', { name: /blocked/i });
    const failedBadge = within(anomalyRail).getByRole('button', { name: /failed/i });

    expect(blockedBadge).toHaveTextContent('1');
    expect(failedBadge).toHaveTextContent('1');

    fireEvent.click(blockedBadge);

    await waitFor(() => {
      expect(dispatchRunDetailsCommandMock).toHaveBeenCalledWith({
        scope: 'playbook',
        selector: 'latest-blocked',
        source: 'shell',
      });
    });
  });

  it('triggers rollback-eligible run inspection via Alt+Shift+R shortcut', async () => {
    apiClientMock.listCommandRuns.mockResolvedValue([
      createCommandRun({
        id: 'cmd-eligible-newest',
        status: 'completed',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 180_000,
        startedAtMs: 3_000,
      }),
    ]);
    apiClientMock.listPlaybookRuns.mockResolvedValue([
      createPlaybookRun({
        id: 'playbook-eligible-older',
        status: 'failed',
        rollbackEligible: true,
        rollbackWindowUntilMs: Date.now() + 120_000,
        createdAtMs: 2_000,
      }),
    ]);

    renderApp();
    expect(await screen.findByText(/live sample:\s*2 runs/i)).toBeInTheDocument();

    fireEvent.keyDown(window, {
      key: 'R',
      altKey: true,
      shiftKey: true,
    });

    await waitFor(() => {
      expect(dispatchRunDetailsCommandMock).toHaveBeenCalledWith({
        scope: 'command',
        selector: 'latest-rollback-eligible',
        source: 'shell',
      });
    });
  });
});
