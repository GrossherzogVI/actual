import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  OpsActivityPipelineStatus,
  RuntimeMetrics,
  WorkerDeadLetter,
  WorkerQueueHealth,
} from '../../core/types';

import { RuntimeControlPanel } from './RuntimeControlPanel';
import { dispatchRuntimeCommand } from './runtime-commands';

const apiClientMock = vi.hoisted(() => ({
  getRuntimeMetrics: vi.fn(),
  getOpsActivityPipelineStatus: vi.fn(),
  listWorkerDeadLetters: vi.fn(),
  getWorkerQueueHealth: vi.fn(),
  backfillOpsActivity: vi.fn(),
  runOpsActivityMaintenance: vi.fn(),
  startOpsActivityPipeline: vi.fn(),
  requeueExpiredQueueJobs: vi.fn(),
  replayWorkerDeadLetters: vi.fn(),
  resolveWorkerDeadLetter: vi.fn(),
  reopenWorkerDeadLetter: vi.fn(),
}));

vi.mock('../../core/api/client', () => ({
  apiClient: apiClientMock,
}));

function createMetrics(
  overrides: Partial<RuntimeMetrics> = {},
): RuntimeMetrics {
  return {
    repositoryKind: 'sqlite',
    queueKind: 'sqlite',
    queueSize: 12,
    queueInFlight: 3,
    playbooks: 2,
    delegateLanes: 5,
    corrections: 0,
    scenarioBranches: 1,
    opsActivityEvents: 100,
    workerJobAttempts: 50,
    workerDeadLetters: 2,
    workerFingerprintClaimEvents: 40,
    workerFingerprintClaimAcquired: 38,
    workerFingerprintClaimAlreadyProcessed: 1,
    workerFingerprintClaimAlreadyClaimed: 1,
    workerFingerprintStaleRecoveries: 0,
    workerFingerprintDuplicateSkipRate: 0.025,
    workerFingerprintContentionRate: 0.025,
    workerFingerprintStaleRecoveryRate: 0,
    ...overrides,
  };
}

function createPipelineStatus(
  overrides: Partial<OpsActivityPipelineStatus> = {},
): OpsActivityPipelineStatus {
  return {
    orchestrator: { running: false, runCount: 3 },
    backfill: { running: false, runCount: 2 },
    maintenance: { running: false, runCount: 1 },
    ...overrides,
  };
}

function createDeadLetter(
  overrides: Partial<WorkerDeadLetter> = {},
): WorkerDeadLetter {
  return {
    id: 'dl-1',
    attemptId: 'attempt-1',
    workerId: 'worker-1',
    jobId: 'job-1',
    jobName: 'classify-transaction',
    receipt: 'receipt-1',
    attempt: 3,
    status: 'open',
    replayCount: 0,
    createdAtMs: Date.now(),
    errorMessage: 'Timeout exceeded',
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

  render(
    <QueryClientProvider client={queryClient}>
      <RuntimeControlPanel onStatus={onStatus} />
    </QueryClientProvider>,
  );

  return { onStatus };
}

describe('RuntimeControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.getRuntimeMetrics.mockResolvedValue(createMetrics());
    apiClientMock.getOpsActivityPipelineStatus.mockResolvedValue(
      createPipelineStatus(),
    );
    apiClientMock.listWorkerDeadLetters.mockResolvedValue([]);
    apiClientMock.getWorkerQueueHealth.mockResolvedValue({
      windowMs: 3_600_000,
      sampleSize: 100,
      generatedAtMs: Date.now(),
      counts: { acked: 90, requeued: 5, dropped: 3, ackMiss: 2 },
      processingMs: { p50: 120, p95: 450, max: 1200 },
      throughputPerMinute: 8,
      failureRate: 0.03,
      retryRate: 0.05,
      deadLetterRate: 0.02,
    } satisfies WorkerQueueHealth);
    apiClientMock.requeueExpiredQueueJobs.mockResolvedValue({
      moved: 3,
      queueSize: 15,
      queueInFlight: 2,
    });
    apiClientMock.replayWorkerDeadLetters.mockResolvedValue({
      replayed: 2,
      skipped: 0,
      notFound: [],
      queueSize: 15,
      queueInFlight: 4,
    });
    apiClientMock.backfillOpsActivity.mockResolvedValue({
      attempted: 50,
      total: 150,
    });
    apiClientMock.runOpsActivityMaintenance.mockResolvedValue({
      removed: 10,
      total: 140,
    });
    apiClientMock.startOpsActivityPipeline.mockResolvedValue({
      started: true,
      status: createPipelineStatus({ orchestrator: { running: true, runCount: 4 } }),
    });
    apiClientMock.resolveWorkerDeadLetter.mockResolvedValue(undefined);
    apiClientMock.reopenWorkerDeadLetter.mockResolvedValue(undefined);
  });

  it('renders runtime signal and metrics', async () => {
    renderPanel();

    expect(await screen.findByText('Runtime Control')).toBeInTheDocument();
    expect(screen.getByText('Runtime signal')).toBeInTheDocument();
    expect(await screen.findByText('Stable')).toBeInTheDocument();
    expect((await screen.findAllByText('sqlite')).length).toBeGreaterThan(0);
  });

  it('executes stabilize runtime and reports results', async () => {
    const { onStatus } = renderPanel();

    await screen.findByText('Runtime Control');

    fireEvent.click(
      screen.getByRole('button', { name: 'Stabilize Runtime' }),
    );

    await waitFor(() => {
      expect(apiClientMock.requeueExpiredQueueJobs).toHaveBeenCalledTimes(1);
      expect(apiClientMock.replayWorkerDeadLetters).toHaveBeenCalledTimes(1);
      expect(apiClientMock.runOpsActivityMaintenance).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Stabilization complete'),
      );
    });
  });

  it('renders dead letter entries and replays a single dead letter', async () => {
    apiClientMock.listWorkerDeadLetters.mockResolvedValue([
      createDeadLetter({ id: 'dl-replay', jobName: 'classify-tx' }),
    ]);

    const { onStatus } = renderPanel();

    expect(
      await screen.findByText(/classify-tx/),
    ).toBeInTheDocument();
    expect(screen.getByText('Timeout exceeded')).toBeInTheDocument();

    const replayButtons = screen.getAllByRole('button', { name: 'Replay' });
    fireEvent.click(replayButtons[0]!);

    await waitFor(() => {
      expect(apiClientMock.replayWorkerDeadLetters).toHaveBeenCalledWith(
        expect.objectContaining({
          deadLetterIds: ['dl-replay'],
        }),
      );
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Replayed'),
      );
    });
  });

  it('responds to runtime command event for stabilize', async () => {
    const { onStatus } = renderPanel();

    await screen.findByText('Runtime Control');

    dispatchRuntimeCommand({ command: 'stabilize', source: 'palette' });

    await waitFor(() => {
      expect(apiClientMock.requeueExpiredQueueJobs).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.stringContaining('Stabilization complete'),
      );
    });
  });
});
