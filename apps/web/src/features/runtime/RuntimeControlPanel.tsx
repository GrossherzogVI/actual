import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type { RuntimeMetrics, WorkerQueueHealth } from '../../core/types';

import {
  RUNTIME_COMMAND_EVENT,
  type RuntimeCommandEventDetail,
} from './runtime-commands';

type RuntimeControlPanelProps = {
  onStatus: (status: string) => void;
};

type RuntimeSignalLevel = 'stable' | 'warn' | 'critical';

type RuntimeSignal = {
  level: RuntimeSignalLevel;
  label: string;
  guidance: string;
  triggers: string[];
};

function coerceInt(
  input: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function coerceNumber(
  input: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function asErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

function buildRuntimeSignal(input: {
  metrics?: RuntimeMetrics;
  queueHealth?: WorkerQueueHealth;
  openDeadLetters: number;
  pipelineError?: string;
}): RuntimeSignal {
  const triggers: string[] = [];

  const openDeadLetters = input.openDeadLetters;
  const queueFailureRate = input.queueHealth?.failureRate ?? 0;
  const queueP95 = input.queueHealth?.processingMs.p95 ?? 0;
  const contentionRate = input.metrics?.workerFingerprintContentionRate ?? 0;
  const staleRecoveryRate = input.metrics?.workerFingerprintStaleRecoveryRate ?? 0;
  const queueInFlight = input.metrics?.queueInFlight ?? 0;
  const pipelineError = input.pipelineError?.trim();

  if (openDeadLetters > 0) {
    triggers.push(`${openDeadLetters} open dead letters`);
  }
  if (queueFailureRate >= 0.05) {
    triggers.push(`failure ${(queueFailureRate * 100).toFixed(1)}%`);
  }
  if (queueP95 > 2_500) {
    triggers.push(`p95 ${queueP95}ms`);
  }
  if (contentionRate >= 0.35) {
    triggers.push(`fingerprint contention ${(contentionRate * 100).toFixed(1)}%`);
  }
  if (staleRecoveryRate >= 0.08) {
    triggers.push(`stale recoveries ${(staleRecoveryRate * 100).toFixed(1)}%`);
  }
  if (queueInFlight > 250) {
    triggers.push(`in-flight backlog ${queueInFlight}`);
  }
  if (pipelineError && pipelineError !== 'none') {
    triggers.push(`pipeline error`);
  }

  const critical =
    openDeadLetters >= 10 ||
    queueFailureRate >= 0.2 ||
    staleRecoveryRate >= 0.15 ||
    queueInFlight >= 500;
  if (critical) {
    return {
      level: 'critical',
      label: 'Critical',
      guidance: 'Stabilize runtime now, then inspect dead letters and contention hotspots.',
      triggers,
    };
  }

  if (triggers.length > 0) {
    return {
      level: 'warn',
      label: 'Watch',
      guidance: 'Runtime is degraded. Execute stabilization and monitor p95/failure trend.',
      triggers,
    };
  }

  return {
    level: 'stable',
    label: 'Stable',
    guidance: 'Runtime is healthy. Keep periodic maintenance cadence and monitor drift.',
    triggers: [],
  };
}

export function RuntimeControlPanel({ onStatus }: RuntimeControlPanelProps) {
  const queryClient = useQueryClient();
  const [limitPerPlane, setLimitPerPlane] = useState('500');
  const [retentionDays, setRetentionDays] = useState('90');
  const [maxRows, setMaxRows] = useState('50000');
  const [requeueLimit, setRequeueLimit] = useState('100');
  const [replayLimit, setReplayLimit] = useState('5');
  const [replayMaxAttempt, setReplayMaxAttempt] = useState('6');
  const [deadLetterStatus, setDeadLetterStatus] = useState<
    'open' | 'replayed' | 'resolved'
  >('open');

  const metrics = useQuery({
    queryKey: ['runtime-metrics'],
    queryFn: apiClient.getRuntimeMetrics,
    refetchInterval: 10_000,
  });

  const pipelineStatus = useQuery({
    queryKey: ['ops-activity-pipeline-status'],
    queryFn: apiClient.getOpsActivityPipelineStatus,
    refetchInterval: 3_000,
  });

  const deadLetters = useQuery({
    queryKey: ['worker-dead-letters', deadLetterStatus],
    queryFn: () =>
      apiClient.listWorkerDeadLetters({
        limit: 8,
        status: deadLetterStatus,
      }),
    refetchInterval: 10_000,
  });

  const openDeadLetters = useQuery({
    queryKey: ['worker-dead-letters-open-count'],
    queryFn: () =>
      apiClient.listWorkerDeadLetters({
        limit: 50,
        status: 'open',
      }),
    refetchInterval: 10_000,
  });

  const queueHealth = useQuery({
    queryKey: ['worker-queue-health'],
    queryFn: () => apiClient.getWorkerQueueHealth({ windowMs: 3_600_000 }),
    refetchInterval: 10_000,
  });

  const invalidateRuntimeQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['runtime-metrics'] }),
      queryClient.invalidateQueries({ queryKey: ['ops-activity-pipeline-status'] }),
      queryClient.invalidateQueries({ queryKey: ['ops-activity'] }),
      queryClient.invalidateQueries({ queryKey: ['worker-queue-health'] }),
      queryClient.invalidateQueries({ queryKey: ['worker-dead-letters'] }),
      queryClient.invalidateQueries({ queryKey: ['worker-dead-letters-open-count'] }),
    ]);
  };

  const backfill = useMutation({
    mutationFn: async () =>
      apiClient.backfillOpsActivity(coerceInt(limitPerPlane, 500, 1, 5000)),
    onSuccess: async result => {
      onStatus(
        `Ops activity backfill attempted ${result.attempted} events. Total stored: ${result.total}.`,
      );
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Backfill failed'));
    },
  });

  const maintenance = useMutation({
    mutationFn: async () =>
      apiClient.runOpsActivityMaintenance({
        retentionDays: coerceNumber(retentionDays, 90, 0, 3650),
        maxRows: coerceInt(maxRows, 50000, 0, 1_000_000),
      }),
    onSuccess: async result => {
      onStatus(
        `Ops activity maintenance removed ${result.removed} events. Total stored: ${result.total}.`,
      );
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Maintenance run failed'));
    },
  });

  const startPipeline = useMutation({
    mutationFn: async () =>
      apiClient.startOpsActivityPipeline({
        runBackfill: true,
        runMaintenance: true,
        limitPerPlane: coerceInt(limitPerPlane, 500, 1, 5000),
        retentionDays: coerceNumber(retentionDays, 90, 0, 3650),
        maxRows: coerceInt(maxRows, 50000, 0, 1_000_000),
        waitForCompletion: false,
      }),
    onSuccess: async result => {
      onStatus(
        result.started
          ? 'Started asynchronous ops activity pipeline.'
          : 'Ops activity pipeline already running.',
      );
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Pipeline start failed'));
    },
  });

  const requeueExpired = useMutation({
    mutationFn: async () =>
      apiClient.requeueExpiredQueueJobs(coerceInt(requeueLimit, 100, 1, 1000)),
    onSuccess: async result => {
      onStatus(
        `Requeued ${result.moved} expired queue claim(s). Ready=${result.queueSize}, in-flight=${result.queueInFlight}.`,
      );
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Expired-claim requeue failed'));
    },
  });

  const replayDeadLetters = useMutation({
    mutationFn: async () =>
      apiClient.replayWorkerDeadLetters({
        limit: coerceInt(replayLimit, 5, 1, 100),
        maxAttempt: coerceInt(replayMaxAttempt, 6, 1, 20),
      }),
    onSuccess: async result => {
      onStatus(
        `Replayed ${result.replayed} dead letter(s), skipped ${result.skipped}. Ready=${result.queueSize}, in-flight=${result.queueInFlight}.`,
      );
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Dead-letter replay failed'));
    },
  });

  const stabilizeRuntime = useMutation({
    mutationFn: async () => {
      const requeueResult = await apiClient.requeueExpiredQueueJobs(
        coerceInt(requeueLimit, 100, 1, 1000),
      );
      const replayResult = await apiClient.replayWorkerDeadLetters({
        limit: coerceInt(replayLimit, 5, 1, 100),
        maxAttempt: coerceInt(replayMaxAttempt, 6, 1, 20),
        operatorId: 'runtime-stabilize',
      });
      const maintenanceResult = await apiClient.runOpsActivityMaintenance({
        retentionDays: coerceNumber(retentionDays, 90, 0, 3650),
        maxRows: coerceInt(maxRows, 50000, 0, 1_000_000),
      });
      return {
        requeueResult,
        replayResult,
        maintenanceResult,
      };
    },
    onSuccess: async result => {
      onStatus(
        `Stabilization complete: requeued ${result.requeueResult.moved}, replayed ${result.replayResult.replayed}, trimmed ${result.maintenanceResult.removed}.`,
      );
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Runtime stabilization failed'));
    },
  });

  const replaySingleDeadLetter = useMutation({
    mutationFn: async (deadLetterId: string) =>
      apiClient.replayWorkerDeadLetters({
        deadLetterIds: [deadLetterId],
        maxAttempt: coerceInt(replayMaxAttempt, 6, 1, 20),
      }),
    onSuccess: async result => {
      onStatus(
        `Replayed ${result.replayed} selected dead letter(s), skipped ${result.skipped}.`,
      );
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Selected dead-letter replay failed'));
    },
  });

  const resolveDeadLetter = useMutation({
    mutationFn: async (deadLetterId: string) =>
      apiClient.resolveWorkerDeadLetter({
        deadLetterId,
        operatorId: 'runtime-panel',
      }),
    onSuccess: async () => {
      onStatus('Marked dead letter as resolved.');
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Resolve dead letter failed'));
    },
  });

  const reopenDeadLetter = useMutation({
    mutationFn: async (deadLetterId: string) =>
      apiClient.reopenWorkerDeadLetter({
        deadLetterId,
        operatorId: 'runtime-panel',
      }),
    onSuccess: async () => {
      onStatus('Reopened dead letter.');
      await invalidateRuntimeQueries();
    },
    onError: error => {
      onStatus(asErrorMessage(error, 'Reopen dead letter failed'));
    },
  });

  const runtimeSignal = useMemo(
    () =>
      buildRuntimeSignal({
        metrics: metrics.data,
        queueHealth: queueHealth.data,
        openDeadLetters: openDeadLetters.data?.length ?? 0,
        pipelineError: pipelineStatus.data?.orchestrator.lastError,
      }),
    [metrics.data, queueHealth.data, openDeadLetters.data, pipelineStatus.data],
  );

  const controlsLocked =
    requeueExpired.isPending ||
    replayDeadLetters.isPending ||
    stabilizeRuntime.isPending ||
    startPipeline.isPending;

  const executeRuntimeCommand = useCallback(
    (command: RuntimeCommandEventDetail['command']) => {
      if (command === 'open-incidents') {
        onStatus('Runtime incident timeline focused.');
        return;
      }
      if (command === 'stabilize' && !stabilizeRuntime.isPending) {
        stabilizeRuntime.mutate();
        return;
      }
      if (command === 'requeue-expired' && !requeueExpired.isPending) {
        requeueExpired.mutate();
        return;
      }
      if (command === 'replay-dead-letters' && !replayDeadLetters.isPending) {
        replayDeadLetters.mutate();
        return;
      }
      if (
        command === 'start-pipeline' &&
        !startPipeline.isPending &&
        pipelineStatus.data?.orchestrator.running !== true
      ) {
        startPipeline.mutate();
      }
    },
    [
      onStatus,
      pipelineStatus.data?.orchestrator.running,
      replayDeadLetters,
      requeueExpired,
      stabilizeRuntime,
      startPipeline,
    ],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        executeRuntimeCommand('stabilize');
      }
      if (key === 'r') {
        event.preventDefault();
        executeRuntimeCommand('requeue-expired');
      }
      if (key === 'd') {
        event.preventDefault();
        executeRuntimeCommand('replay-dead-letters');
      }
      if (key === 'p') {
        event.preventDefault();
        executeRuntimeCommand('start-pipeline');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [executeRuntimeCommand]);

  useEffect(() => {
    const onRuntimeCommand = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeCommandEventDetail>).detail;
      if (!detail?.command) {
        return;
      }
      executeRuntimeCommand(detail.command);
    };

    window.addEventListener(RUNTIME_COMMAND_EVENT, onRuntimeCommand as EventListener);
    return () =>
      window.removeEventListener(
        RUNTIME_COMMAND_EVENT,
        onRuntimeCommand as EventListener,
      );
  }, [executeRuntimeCommand]);

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Runtime Control</h2>
        <small>Ops activity backfill, queue resilience, and worker reliability.</small>
      </header>

      <div className="fo-stack">
        <article className={`fo-card fo-runtime-signal fo-runtime-signal-${runtimeSignal.level}`}>
          <div className="fo-space-between">
            <small>Runtime signal</small>
            <span className={`fo-runtime-badge fo-runtime-badge-${runtimeSignal.level}`}>
              {runtimeSignal.label}
            </span>
          </div>
          <strong>{runtimeSignal.guidance}</strong>
          <small>
            {runtimeSignal.triggers.length > 0
              ? runtimeSignal.triggers.join(' | ')
              : 'No active queue, contention, or dead-letter alerts.'}
          </small>
          <div className="fo-row">
            <button
              className="fo-btn"
              type="button"
              disabled={controlsLocked}
              onClick={() => stabilizeRuntime.mutate()}
            >
              {stabilizeRuntime.isPending ? 'Stabilizing...' : 'Stabilize Runtime'}
            </button>
            <button
              className="fo-btn-secondary"
              type="button"
              disabled={
                startPipeline.isPending ||
                pipelineStatus.data?.orchestrator.running === true
              }
              onClick={() => startPipeline.mutate()}
            >
              {startPipeline.isPending ? 'Starting...' : 'Start Pipeline'}
            </button>
          </div>
          <div className="fo-hints">
            <code>alt+shift+s stabilize</code>
            <code>alt+shift+r requeue</code>
            <code>alt+shift+d replay</code>
            <code>alt+shift+p pipeline</code>
          </div>
        </article>

        <article className="fo-card">
          <div className="fo-space-between">
            <small>Repository</small>
            <strong>{metrics.data?.repositoryKind || '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Queue</small>
            <strong>{metrics.data?.queueKind || '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Queue size</small>
            <strong>{metrics.data?.queueSize ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>In flight</small>
            <strong>{metrics.data?.queueInFlight ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Open dead letters</small>
            <strong>{openDeadLetters.data?.length ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Ops activity events</small>
            <strong>{metrics.data?.opsActivityEvents ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Worker attempts</small>
            <strong>{metrics.data?.workerJobAttempts ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Worker dead letters</small>
            <strong>{metrics.data?.workerDeadLetters ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Fingerprint claims</small>
            <strong>{metrics.data?.workerFingerprintClaimEvents ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Fingerprint contended</small>
            <strong>{metrics.data?.workerFingerprintClaimAlreadyClaimed ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Duplicate skips</small>
            <strong>{metrics.data?.workerFingerprintClaimAlreadyProcessed ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Stale lock recoveries</small>
            <strong>{metrics.data?.workerFingerprintStaleRecoveries ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Duplicate skip rate</small>
            <strong>
              {metrics.data
                ? `${(metrics.data.workerFingerprintDuplicateSkipRate * 100).toFixed(2)}%`
                : '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small>Fingerprint contention rate</small>
            <strong>
              {metrics.data
                ? `${(metrics.data.workerFingerprintContentionRate * 100).toFixed(2)}%`
                : '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small>Stale recovery rate</small>
            <strong>
              {metrics.data
                ? `${(metrics.data.workerFingerprintStaleRecoveryRate * 100).toFixed(2)}%`
                : '-'}
            </strong>
          </div>
          <small>Expired claim requeue limit</small>
          <input
            className="fo-input"
            value={requeueLimit}
            onChange={event => setRequeueLimit(event.target.value)}
            inputMode="numeric"
          />
          <button
            className="fo-btn-secondary"
            type="button"
            disabled={requeueExpired.isPending}
            onClick={() => requeueExpired.mutate()}
          >
            {requeueExpired.isPending ? 'Requeueing...' : 'Requeue Expired Claims'}
          </button>
          <div className="fo-space-between">
            <small>Queue throughput/min</small>
            <strong>{queueHealth.data?.throughputPerMinute ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Queue failure rate</small>
            <strong>
              {queueHealth.data ? `${(queueHealth.data.failureRate * 100).toFixed(2)}%` : '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small>Queue p95 ms</small>
            <strong>{queueHealth.data?.processingMs.p95 ?? '-'}</strong>
          </div>
        </article>

        <article className="fo-card">
          <div className="fo-space-between">
            <small>Pipeline</small>
            <strong>
              {pipelineStatus.data?.orchestrator.running ? 'running' : 'idle'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small>Backfill runs</small>
            <strong>{pipelineStatus.data?.backfill.runCount ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Maintenance runs</small>
            <strong>{pipelineStatus.data?.maintenance.runCount ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small>Last pipeline error</small>
            <strong>{pipelineStatus.data?.orchestrator.lastError || 'none'}</strong>
          </div>
          <button
            className="fo-btn-secondary"
            type="button"
            disabled={
              startPipeline.isPending ||
              pipelineStatus.data?.orchestrator.running === true
            }
            onClick={() => startPipeline.mutate()}
          >
            {startPipeline.isPending ? 'Starting...' : 'Start Async Pipeline'}
          </button>
        </article>

        <article className="fo-card">
          <small>Backfill limit per plane</small>
          <input
            className="fo-input"
            value={limitPerPlane}
            onChange={event => setLimitPerPlane(event.target.value)}
            inputMode="numeric"
          />
          <button
            className="fo-btn-secondary"
            type="button"
            disabled={backfill.isPending || pipelineStatus.data?.backfill.running === true}
            onClick={() => backfill.mutate()}
          >
            {backfill.isPending ? 'Backfilling...' : 'Run Backfill'}
          </button>
        </article>

        <article className="fo-card">
          <small>Retention days</small>
          <input
            className="fo-input"
            value={retentionDays}
            onChange={event => setRetentionDays(event.target.value)}
            inputMode="decimal"
          />
          <small>Max rows</small>
          <input
            className="fo-input"
            value={maxRows}
            onChange={event => setMaxRows(event.target.value)}
            inputMode="numeric"
          />
          <button
            className="fo-btn-secondary"
            type="button"
            disabled={
              maintenance.isPending ||
              pipelineStatus.data?.maintenance.running === true
            }
            onClick={() => maintenance.mutate()}
          >
            {maintenance.isPending ? 'Running...' : 'Run Maintenance'}
          </button>
        </article>

        <article className="fo-card">
          <div className="fo-space-between">
            <small>Dead letter queue</small>
            <strong>{deadLetters.data?.length ?? 0}</strong>
          </div>
          <small>Status filter</small>
          <select
            className="fo-input"
            value={deadLetterStatus}
            onChange={event =>
              setDeadLetterStatus(
                event.target.value as 'open' | 'replayed' | 'resolved',
              )
            }
          >
            <option value="open">open</option>
            <option value="replayed">replayed</option>
            <option value="resolved">resolved</option>
          </select>
          {deadLetters.data && deadLetters.data.length > 0 ? (
            <div className="fo-stack">
              {deadLetters.data.map(entry => (
                <div key={entry.id} className="fo-card">
                  <div className="fo-space-between">
                    <small>
                      {entry.jobName} (#{entry.attempt})
                    </small>
                    <small>{entry.status}</small>
                  </div>
                  <div className="fo-space-between">
                    <small>replays: {entry.replayCount}</small>
                    <small>{entry.errorMessage || 'dropped'}</small>
                  </div>
                  <div className="fo-space-between">
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      disabled={replaySingleDeadLetter.isPending}
                      onClick={() => replaySingleDeadLetter.mutate(entry.id)}
                    >
                      Replay
                    </button>
                    {entry.status === 'resolved' ? (
                      <button
                        className="fo-btn-secondary"
                        type="button"
                        disabled={reopenDeadLetter.isPending}
                        onClick={() => reopenDeadLetter.mutate(entry.id)}
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        className="fo-btn-secondary"
                        type="button"
                        disabled={resolveDeadLetter.isPending}
                        onClick={() => resolveDeadLetter.mutate(entry.id)}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <small>No worker dead letters.</small>
          )}
          <small>Replay limit</small>
          <input
            className="fo-input"
            value={replayLimit}
            onChange={event => setReplayLimit(event.target.value)}
            inputMode="numeric"
          />
          <small>Replay max attempt</small>
          <input
            className="fo-input"
            value={replayMaxAttempt}
            onChange={event => setReplayMaxAttempt(event.target.value)}
            inputMode="numeric"
          />
          <button
            className="fo-btn-secondary"
            type="button"
            disabled={replayDeadLetters.isPending}
            onClick={() => replayDeadLetters.mutate()}
          >
            {replayDeadLetters.isPending ? 'Replaying...' : 'Replay Dead Letters'}
          </button>
        </article>
      </div>
    </section>
  );
}
