import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type { RuntimeMetrics, WorkerQueueHealth } from '../../core/types';

import { RUNTIME_COMMAND_EVENT } from './runtime-commands';
import type { RuntimeCommandEventDetail } from './runtime-commands';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const staleRecoveryRate =
    input.metrics?.workerFingerprintStaleRecoveryRate ?? 0;
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
    triggers.push(
      `fingerprint contention ${(contentionRate * 100).toFixed(1)}%`,
    );
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
      guidance:
        'Stabilize runtime now, then inspect dead letters and contention hotspots.',
      triggers,
    };
  }

  if (triggers.length > 0) {
    return {
      level: 'warn',
      label: 'Watch',
      guidance:
        'Runtime is degraded. Execute stabilization and monitor p95/failure trend.',
      triggers,
    };
  }

  return {
    level: 'stable',
    label: 'Stable',
    guidance:
      'Runtime is healthy. Keep periodic maintenance cadence and monitor drift.',
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
      queryClient.invalidateQueries({
        queryKey: ['ops-activity-pipeline-status'],
      }),
      queryClient.invalidateQueries({ queryKey: ['ops-activity'] }),
      queryClient.invalidateQueries({ queryKey: ['worker-queue-health'] }),
      queryClient.invalidateQueries({ queryKey: ['worker-dead-letters'] }),
      queryClient.invalidateQueries({
        queryKey: ['worker-dead-letters-open-count'],
      }),
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

    window.addEventListener(
      RUNTIME_COMMAND_EVENT,
      onRuntimeCommand as EventListener,
    );
    return () =>
      window.removeEventListener(
        RUNTIME_COMMAND_EVENT,
        onRuntimeCommand as EventListener,
      );
  }, [executeRuntimeCommand]);

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>
          <Trans>Runtime Control</Trans>
        </h2>
        <small>
          Ops activity backfill, queue resilience, and worker reliability.
        </small>
      </header>

      <div className="fo-stack">
        <article
          className={`fo-card fo-runtime-signal fo-runtime-signal-${runtimeSignal.level}`}
        >
          <div className="fo-space-between">
            <small><Trans>Runtime signal</Trans></small>
            <span
              className={`fo-runtime-badge fo-runtime-badge-${runtimeSignal.level}`}
            >
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
            <Button
              disabled={controlsLocked}
              onClick={() => stabilizeRuntime.mutate()}
            >
              {stabilizeRuntime.isPending
                ? 'Stabilizing...'
                : t('Stabilize Runtime')}
            </Button>
            <Button
              variant="secondary"
              disabled={
                startPipeline.isPending ||
                pipelineStatus.data?.orchestrator.running === true
              }
              onClick={() => startPipeline.mutate()}
            >
              {startPipeline.isPending ? 'Starting...' : t('Start Pipeline')}
            </Button>
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
            <small><Trans>Repository</Trans></small>
            <strong>{metrics.data?.repositoryKind || '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Queue</Trans></small>
            <strong>{metrics.data?.queueKind || '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Queue size</Trans></small>
            <strong>{metrics.data?.queueSize ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>In flight</Trans></small>
            <strong>{metrics.data?.queueInFlight ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Open dead letters</Trans></small>
            <strong>{openDeadLetters.data?.length ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Ops activity events</Trans></small>
            <strong>{metrics.data?.opsActivityEvents ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Worker attempts</Trans></small>
            <strong>{metrics.data?.workerJobAttempts ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Worker dead letters</Trans></small>
            <strong>{metrics.data?.workerDeadLetters ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Fingerprint claims</Trans></small>
            <strong>{metrics.data?.workerFingerprintClaimEvents ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Fingerprint contended</Trans></small>
            <strong>
              {metrics.data?.workerFingerprintClaimAlreadyClaimed ?? '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Duplicate skips</Trans></small>
            <strong>
              {metrics.data?.workerFingerprintClaimAlreadyProcessed ?? '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Stale lock recoveries</Trans></small>
            <strong>
              {metrics.data?.workerFingerprintStaleRecoveries ?? '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Duplicate skip rate</Trans></small>
            <strong>
              {metrics.data
                ? `${(metrics.data.workerFingerprintDuplicateSkipRate * 100).toFixed(2)}%`
                : '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Fingerprint contention rate</Trans></small>
            <strong>
              {metrics.data
                ? `${(metrics.data.workerFingerprintContentionRate * 100).toFixed(2)}%`
                : '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Stale recovery rate</Trans></small>
            <strong>
              {metrics.data
                ? `${(metrics.data.workerFingerprintStaleRecoveryRate * 100).toFixed(2)}%`
                : '-'}
            </strong>
          </div>
          <small><Trans>Expired claim requeue limit</Trans></small>
          <Input
            value={requeueLimit}
            onChange={event => setRequeueLimit(event.target.value)}
            inputMode="numeric"
          />
          <Button
            variant="secondary"
            disabled={requeueExpired.isPending}
            onClick={() => requeueExpired.mutate()}
          >
            {requeueExpired.isPending
              ? 'Requeueing...'
              : t('Requeue Expired Claims')}
          </Button>
          <div className="fo-space-between">
            <small><Trans>Queue throughput/min</Trans></small>
            <strong>{queueHealth.data?.throughputPerMinute ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Queue failure rate</Trans></small>
            <strong>
              {queueHealth.data
                ? `${(queueHealth.data.failureRate * 100).toFixed(2)}%`
                : '-'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Queue p95 ms</Trans></small>
            <strong>{queueHealth.data?.processingMs.p95 ?? '-'}</strong>
          </div>
        </article>

        <article className="fo-card">
          <div className="fo-space-between">
            <small><Trans>Pipeline</Trans></small>
            <strong>
              {pipelineStatus.data?.orchestrator.running ? 'running' : 'idle'}
            </strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Backfill runs</Trans></small>
            <strong>{pipelineStatus.data?.backfill.runCount ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Maintenance runs</Trans></small>
            <strong>{pipelineStatus.data?.maintenance.runCount ?? '-'}</strong>
          </div>
          <div className="fo-space-between">
            <small><Trans>Last pipeline error</Trans></small>
            <strong>
              {pipelineStatus.data?.orchestrator.lastError || 'none'}
            </strong>
          </div>
          <Button
            variant="secondary"
            disabled={
              startPipeline.isPending ||
              pipelineStatus.data?.orchestrator.running === true
            }
            onClick={() => startPipeline.mutate()}
          >
            {startPipeline.isPending
              ? 'Starting...'
              : t('Start Async Pipeline')}
          </Button>
        </article>

        <article className="fo-card">
          <small><Trans>Backfill limit per plane</Trans></small>
          <Input
            value={limitPerPlane}
            onChange={event => setLimitPerPlane(event.target.value)}
            inputMode="numeric"
          />
          <Button
            variant="secondary"
            disabled={
              backfill.isPending ||
              pipelineStatus.data?.backfill.running === true
            }
            onClick={() => backfill.mutate()}
          >
            {backfill.isPending ? 'Backfilling...' : t('Run Backfill')}
          </Button>
        </article>

        <article className="fo-card">
          <small><Trans>Retention days</Trans></small>
          <Input
            value={retentionDays}
            onChange={event => setRetentionDays(event.target.value)}
            inputMode="decimal"
          />
          <small><Trans>Max rows</Trans></small>
          <Input
            value={maxRows}
            onChange={event => setMaxRows(event.target.value)}
            inputMode="numeric"
          />
          <Button
            variant="secondary"
            disabled={
              maintenance.isPending ||
              pipelineStatus.data?.maintenance.running === true
            }
            onClick={() => maintenance.mutate()}
          >
            {maintenance.isPending ? 'Running...' : t('Run Maintenance')}
          </Button>
        </article>

        <article className="fo-card">
          <div className="fo-space-between">
            <small><Trans>Dead letter queue</Trans></small>
            <strong>{deadLetters.data?.length ?? 0}</strong>
          </div>
          <small><Trans>Status filter</Trans></small>
          <Select
            value={deadLetterStatus}
            onValueChange={value =>
              setDeadLetterStatus(value as 'open' | 'replayed' | 'resolved')
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('Status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">open</SelectItem>
              <SelectItem value="replayed">replayed</SelectItem>
              <SelectItem value="resolved">resolved</SelectItem>
            </SelectContent>
          </Select>
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
                  <div className="fo-space-between mt-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={replaySingleDeadLetter.isPending}
                      onClick={() => replaySingleDeadLetter.mutate(entry.id)}
                    ><Trans>
                      Replay
                    </Trans></Button>
                    {entry.status === 'resolved' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={reopenDeadLetter.isPending}
                        onClick={() => reopenDeadLetter.mutate(entry.id)}
                      ><Trans>
                        Reopen
                      </Trans></Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={resolveDeadLetter.isPending}
                        onClick={() => resolveDeadLetter.mutate(entry.id)}
                      ><Trans>
                        Resolve
                      </Trans></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <small>No worker dead letters.</small>
          )}
          <small><Trans>Replay limit</Trans></small>
          <Input
            value={replayLimit}
            onChange={event => setReplayLimit(event.target.value)}
            inputMode="numeric"
          />
          <small><Trans>Replay max attempt</Trans></small>
          <Input
            value={replayMaxAttempt}
            onChange={event => setReplayMaxAttempt(event.target.value)}
            inputMode="numeric"
          />
          <Button
            variant="secondary"
            disabled={replayDeadLetters.isPending}
            onClick={() => replayDeadLetters.mutate()}
          >
            {replayDeadLetters.isPending
              ? 'Replaying...'
              : t('Replay Dead Letters')}
          </Button>
        </article>
      </div>
    </section>
  );
}
