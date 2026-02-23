import { useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type {
  OpsActivityEvent,
  OpsActivitySeverity,
  RuntimeMetrics,
  WorkerDeadLetter,
  WorkerQueueHealth,
} from '../../core/types';

import { dispatchRuntimeCommand } from './runtime-commands';

import { Button } from '@/components/ui/button';

type RuntimeIncidentTimelinePanelProps = {
  onRoute: (route: string) => void;
  onStatus: (status: string) => void;
};

type IncidentSeverity = OpsActivitySeverity;
type IncidentFilter = 'all' | IncidentSeverity;

type RuntimeIncident = {
  id: string;
  severity: IncidentSeverity;
  title: string;
  detail: string;
  createdAtMs: number;
  source: 'derived' | 'ops-activity' | 'dead-letter';
  route?: string;
  deadLetterId?: string;
  actionLabel?: string;
  action: 'open-route' | 'replay-dead-letter' | 'stabilize' | 'requeue';
};

function toSeverity(
  input: number,
  warnThreshold: number,
  criticalThreshold: number,
): IncidentSeverity | null {
  if (input >= criticalThreshold) {
    return 'critical';
  }
  if (input >= warnThreshold) {
    return 'warn';
  }
  return null;
}

function relativeAge(createdAtMs: number): string {
  const elapsedSec = Math.max(0, Math.floor((Date.now() - createdAtMs) / 1000));
  if (elapsedSec < 60) {
    return `${elapsedSec}s ago`;
  }
  if (elapsedSec < 3600) {
    return `${Math.floor(elapsedSec / 60)}m ago`;
  }
  if (elapsedSec < 86_400) {
    return `${Math.floor(elapsedSec / 3600)}h ago`;
  }
  return `${Math.floor(elapsedSec / 86_400)}d ago`;
}

function buildDerivedIncidents(input: {
  metrics?: RuntimeMetrics;
  queueHealth?: WorkerQueueHealth;
  pipelineError?: string;
  deadLetters: WorkerDeadLetter[];
  opsActivity: OpsActivityEvent[];
}): RuntimeIncident[] {
  const incidents: RuntimeIncident[] = [];
  const now = Date.now();
  const contentionRate = input.metrics?.workerFingerprintContentionRate ?? 0;
  const staleRecoveryRate =
    input.metrics?.workerFingerprintStaleRecoveryRate ?? 0;
  const queueFailureRate = input.queueHealth?.failureRate ?? 0;
  const queueP95 = input.queueHealth?.processingMs.p95 ?? 0;
  const queueInFlight = input.metrics?.queueInFlight ?? 0;
  const pipelineError = input.pipelineError?.trim() || '';

  const queueFailureSeverity = toSeverity(queueFailureRate, 0.05, 0.2);
  if (queueFailureSeverity) {
    incidents.push({
      id: 'runtime-queue-failure',
      severity: queueFailureSeverity,
      title: 'Queue failure-rate alert',
      detail: `Worker queue failure is ${(queueFailureRate * 100).toFixed(2)}%.`,
      createdAtMs: now,
      source: 'derived',
      action: 'stabilize',
      actionLabel: 'Stabilize',
    });
  }

  const latencySeverity = toSeverity(queueP95, 2500, 5000);
  if (latencySeverity) {
    incidents.push({
      id: 'runtime-queue-latency',
      severity: latencySeverity,
      title: 'Queue latency alert',
      detail: `Queue processing p95 is ${queueP95}ms.`,
      createdAtMs: now,
      source: 'derived',
      action: 'requeue',
      actionLabel: 'Requeue Expired',
    });
  }

  const contentionSeverity = toSeverity(contentionRate, 0.35, 0.6);
  if (contentionSeverity) {
    incidents.push({
      id: 'runtime-fingerprint-contention',
      severity: contentionSeverity,
      title: 'Fingerprint contention alert',
      detail: `Contention is ${(contentionRate * 100).toFixed(2)}% of claims.`,
      createdAtMs: now,
      source: 'derived',
      action: 'stabilize',
      actionLabel: 'Stabilize',
    });
  }

  const staleSeverity = toSeverity(staleRecoveryRate, 0.08, 0.15);
  if (staleSeverity) {
    incidents.push({
      id: 'runtime-stale-recovery',
      severity: staleSeverity,
      title: 'Stale lock recovery alert',
      detail: `Stale lock recoveries are ${(staleRecoveryRate * 100).toFixed(2)}% of claims.`,
      createdAtMs: now,
      source: 'derived',
      action: 'stabilize',
      actionLabel: 'Stabilize',
    });
  }

  if (queueInFlight > 250) {
    incidents.push({
      id: 'runtime-in-flight-backlog',
      severity: queueInFlight > 500 ? 'critical' : 'warn',
      title: 'Queue backlog alert',
      detail: `${queueInFlight} jobs are in-flight.`,
      createdAtMs: now,
      source: 'derived',
      action: 'requeue',
      actionLabel: 'Requeue Expired',
    });
  }

  if (pipelineError && pipelineError !== 'none') {
    incidents.push({
      id: 'runtime-pipeline-error',
      severity: 'critical',
      title: 'Ops pipeline error',
      detail: pipelineError,
      createdAtMs: now,
      source: 'derived',
      action: 'stabilize',
      actionLabel: 'Stabilize',
    });
  }

  for (const entry of input.deadLetters) {
    incidents.push({
      id: `dead-letter-${entry.id}`,
      severity: 'critical',
      title: `Dead letter: ${entry.jobName}`,
      detail: entry.errorMessage || 'Dropped without explicit error payload.',
      createdAtMs: entry.createdAtMs,
      source: 'dead-letter',
      deadLetterId: entry.id,
      action: 'replay-dead-letter',
      actionLabel: 'Replay',
    });
  }

  for (const event of input.opsActivity) {
    incidents.push({
      id: `ops-${event.id}`,
      severity: event.severity,
      title: event.title,
      detail: event.detail,
      createdAtMs: event.createdAtMs,
      source: 'ops-activity',
      route: event.route,
      action: event.route ? 'open-route' : 'stabilize',
      actionLabel: event.route ? 'Open' : 'Stabilize',
    });
  }

  return incidents.sort((a, b) => b.createdAtMs - a.createdAtMs).slice(0, 40);
}

export function RuntimeIncidentTimelinePanel({
  onRoute,
  onStatus,
}: RuntimeIncidentTimelinePanelProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<IncidentFilter>('all');

  const metrics = useQuery({
    queryKey: ['runtime-metrics'],
    queryFn: apiClient.getRuntimeMetrics,
    refetchInterval: 10_000,
  });

  const queueHealth = useQuery({
    queryKey: ['worker-queue-health'],
    queryFn: () => apiClient.getWorkerQueueHealth({ windowMs: 3_600_000 }),
    refetchInterval: 10_000,
  });

  const pipelineStatus = useQuery({
    queryKey: ['ops-activity-pipeline-status'],
    queryFn: apiClient.getOpsActivityPipelineStatus,
    refetchInterval: 3_000,
  });

  const deadLetters = useQuery({
    queryKey: ['worker-dead-letters', 'open', 'timeline'],
    queryFn: () =>
      apiClient.listWorkerDeadLetters({
        status: 'open',
        limit: 12,
      }),
    refetchInterval: 10_000,
  });

  const opsActivity = useQuery({
    queryKey: ['ops-activity', 'incident-timeline'],
    queryFn: () =>
      apiClient.listOpsActivity({
        limit: 20,
        severities: ['critical', 'warn'],
      }),
    refetchInterval: 8_000,
  });

  const replayDeadLetter = useMutation({
    mutationFn: async (deadLetterId: string) =>
      apiClient.replayWorkerDeadLetters({
        deadLetterIds: [deadLetterId],
        maxAttempt: 6,
      }),
    onSuccess: async result => {
      onStatus(
        `Incident replay complete: replayed ${result.replayed}, skipped ${result.skipped}.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['worker-dead-letters'] }),
        queryClient.invalidateQueries({ queryKey: ['worker-queue-health'] }),
        queryClient.invalidateQueries({ queryKey: ['ops-activity'] }),
        queryClient.invalidateQueries({ queryKey: ['runtime-metrics'] }),
      ]);
    },
    onError: error => {
      const message = error instanceof Error ? error.message : String(error);
      onStatus(`Incident replay failed: ${message}`);
    },
  });

  const incidents = useMemo(
    () =>
      buildDerivedIncidents({
        metrics: metrics.data,
        queueHealth: queueHealth.data,
        pipelineError: pipelineStatus.data?.orchestrator.lastError,
        deadLetters: deadLetters.data || [],
        opsActivity: opsActivity.data?.events || [],
      }),
    [
      deadLetters.data,
      metrics.data,
      opsActivity.data?.events,
      pipelineStatus.data?.orchestrator.lastError,
      queueHealth.data,
    ],
  );

  const filteredIncidents = useMemo(() => {
    if (filter === 'all') {
      return incidents;
    }
    return incidents.filter(incident => incident.severity === filter);
  }, [filter, incidents]);

  const criticalCount = incidents.filter(
    item => item.severity === 'critical',
  ).length;
  const warnCount = incidents.filter(item => item.severity === 'warn').length;

  const runTimelineCommand = (
    command: 'stabilize' | 'requeue-expired' | 'replay-dead-letters',
  ) => {
    dispatchRuntimeCommand({
      command,
      source: 'timeline',
    });
  };

  const handleIncidentAction = (incident: RuntimeIncident) => {
    if (incident.action === 'open-route' && incident.route) {
      onRoute(incident.route);
      return;
    }

    if (incident.action === 'replay-dead-letter' && incident.deadLetterId) {
      replayDeadLetter.mutate(incident.deadLetterId);
      return;
    }

    if (incident.action === 'requeue') {
      runTimelineCommand('requeue-expired');
      onStatus('Runtime command sent: requeue expired claims.');
      return;
    }

    runTimelineCommand('stabilize');
    onStatus('Runtime command sent: stabilize pipeline and queue.');
  };

  return (
    <section className="fo-panel" id="runtime-incidents">
      <header className="fo-panel-header">
        <h2>
          Runtime Incident Timeline
        </h2>
        <small>
          Correlates dead letters, queue pressure, contention spikes, and
          pipeline failures.
        </small>
      </header>

      <div className="fo-space-between">
        <strong>{filteredIncidents.length} incidents</strong>
        <small>
          critical: {criticalCount} | warn: {warnCount}
        </small>
      </div>

      <div className="fo-incident-toolbar">
        <Button
          variant={filter === 'all' ? 'default' : 'secondary'}
          className="fo-chip"
          size="sm"
          onClick={() => setFilter('all')}
        >
          all
        </Button>
        <Button
          variant={filter === 'critical' ? 'destructive' : 'secondary'}
          className="fo-chip"
          size="sm"
          onClick={() => setFilter('critical')}
        >
          critical
        </Button>
        <Button
          variant={filter === 'warn' ? 'default' : 'secondary'}
          className="fo-chip"
          size="sm"
          onClick={() => setFilter('warn')}
        >
          warn
        </Button>
        <Button
          variant={filter === 'info' ? 'default' : 'secondary'}
          className="fo-chip"
          size="sm"
          onClick={() => setFilter('info')}
        >
          info
        </Button>
      </div>

      <div className="fo-row">
        <Button
          variant="secondary"
          onClick={() => runTimelineCommand('stabilize')}
        >Stabilize</Button>
        <Button
          variant="secondary"
          onClick={() => runTimelineCommand('requeue-expired')}
        >Requeue Expired</Button>
        <Button
          variant="secondary"
          onClick={() => runTimelineCommand('replay-dead-letters')}
        >Replay Dead Letters</Button>
      </div>

      <div className="fo-incident-list">
        {filteredIncidents.length === 0 ? (
          <small className="fo-muted-line">
            No incidents matching current filter.
          </small>
        ) : null}
        {filteredIncidents.map(incident => (
          <article
            key={incident.id}
            className={`fo-incident-item fo-incident-${incident.severity}`}
          >
            <div className="fo-space-between">
              <strong>{incident.title}</strong>
              <small>{relativeAge(incident.createdAtMs)}</small>
            </div>
            <small>{incident.detail}</small>
            <div className="fo-space-between">
              <small>
                {incident.source} |{' '}
                {new Date(incident.createdAtMs).toLocaleTimeString()}
              </small>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  replayDeadLetter.isPending &&
                  incident.action === 'replay-dead-letter'
                }
                onClick={() => handleIncidentAction(incident)}
              >
                {incident.actionLabel || 'Execute'}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
