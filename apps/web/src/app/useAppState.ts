import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../core/api/client';
import type { PlaybookRun, RunStatus, WorkflowCommandExecution } from '../core/types';

export type RunAnomalyCandidate = {
  scope: 'command' | 'playbook';
  id: string;
  status: RunStatus;
  createdAtMs: number;
  rollbackWindowUntilMs?: number;
  rollbackEligible: boolean;
  statusPath: string;
};

function toCommandRunCandidate(run: WorkflowCommandExecution): RunAnomalyCandidate {
  return {
    scope: 'command',
    id: run.id,
    status: run.status,
    createdAtMs: run.startedAtMs,
    rollbackWindowUntilMs: run.rollbackWindowUntilMs,
    rollbackEligible: run.rollbackEligible,
    statusPath: run.statusTimeline.map(step => step.status).join(' -> '),
  };
}

function toPlaybookRunCandidate(run: PlaybookRun): RunAnomalyCandidate {
  return {
    scope: 'playbook',
    id: run.id,
    status: run.status,
    createdAtMs: run.createdAtMs,
    rollbackWindowUntilMs: run.rollbackWindowUntilMs,
    rollbackEligible: run.rollbackEligible,
    statusPath: run.statusTimeline.map(step => step.status).join(' -> '),
  };
}

export function useAppState() {
  const moneyPulse = useQuery({
    queryKey: ['money-pulse'],
    queryFn: apiClient.getMoneyPulse,
    refetchInterval: 15_000,
  });

  const recommendations = useQuery({
    queryKey: ['recommendations'],
    queryFn: apiClient.getRecommendations,
    refetchInterval: 30_000,
  });

  const narrativePulse = useQuery({
    queryKey: ['narrative-pulse'],
    queryFn: apiClient.getNarrativePulse,
    refetchInterval: 30_000,
  });

  const recentLiveCommandRuns = useQuery({
    queryKey: ['command-runs', 'recent-live'],
    queryFn: () => apiClient.listCommandRuns({ limit: 50, executionMode: 'live' }),
    refetchInterval: 15_000,
  });

  const recentLivePlaybookRuns = useQuery({
    queryKey: ['playbook-runs', 'recent-live'],
    queryFn: () => apiClient.listPlaybookRuns({ limit: 50, executionMode: 'live' }),
    refetchInterval: 15_000,
  });

  const recentRunCandidates = useMemo(() => {
    const commandCandidates = (recentLiveCommandRuns.data || []).map(toCommandRunCandidate);
    const playbookCandidates = (recentLivePlaybookRuns.data || []).map(toPlaybookRunCandidate);
    return [...commandCandidates, ...playbookCandidates].sort(
      (a, b) => b.createdAtMs - a.createdAtMs,
    );
  }, [recentLiveCommandRuns.data, recentLivePlaybookRuns.data]);

  const latestTerminalRun = useMemo(() => {
    const latest = recentRunCandidates[0];
    if (!latest) return null;
    return {
      status: latest.status,
      rollbackWindowUntilMs: latest.rollbackWindowUntilMs,
      createdAtMs: latest.createdAtMs,
      statusPath: latest.statusPath,
    };
  }, [recentRunCandidates]);

  const anomalyTargets = useMemo(() => {
    const now = Date.now();
    return {
      blocked: recentRunCandidates.find(c => c.status === 'blocked') || null,
      failed: recentRunCandidates.find(c => c.status === 'failed') || null,
      rollbackEligible:
        recentRunCandidates.find(
          c =>
            c.rollbackEligible &&
            (c.status === 'completed' || c.status === 'failed') &&
            typeof c.rollbackWindowUntilMs === 'number' &&
            c.rollbackWindowUntilMs > now,
        ) || null,
    };
  }, [recentRunCandidates]);

  const anomalyCounts = useMemo(() => {
    const now = Date.now();
    return {
      blocked: recentRunCandidates.filter(c => c.status === 'blocked').length,
      failed: recentRunCandidates.filter(c => c.status === 'failed').length,
      rollbackEligible: recentRunCandidates.filter(
        c =>
          c.rollbackEligible &&
          (c.status === 'completed' || c.status === 'failed') &&
          typeof c.rollbackWindowUntilMs === 'number' &&
          c.rollbackWindowUntilMs > now,
      ).length,
      sampleSize: recentRunCandidates.length,
    };
  }, [recentRunCandidates]);

  const loops = useMemo(
    () => [
      { id: 'morning', label: 'Morning Loop', route: '/ops', hint: '1' },
      { id: 'capture', label: 'Capture Loop', route: '/quick-add', hint: '2' },
      { id: 'triage', label: 'Triage Loop', route: '/review?priority=urgent', hint: '3' },
      { id: 'execution', label: 'Execution Loop', route: '/contracts?filter=expiring', hint: '4' },
      { id: 'close', label: 'Close Loop', route: '/ops', hint: '5' },
      { id: 'simulation', label: 'Simulation Loop', route: '/ops#spatial-twin', hint: '6' },
    ],
    [],
  );

  const shellActions = useMemo(
    () => [
      { id: 'resolve-next-action', label: 'Resolve Next', hint: 'N A' },
      { id: 'run-weekly-close', label: 'Weekly Close', hint: 'W C' },
      { id: 'run-triage-chain', label: 'Triage Chain', hint: 'T C' },
      { id: 'run-autopilot-live', label: 'Autopilot Live', hint: 'A L' },
      { id: 'runtime-stabilize', label: 'Stabilize Runtime', hint: 'R S' },
      { id: 'open-runtime-incidents', label: 'Incident Timeline', hint: 'R I' },
      { id: 'rollback-last-command-run', label: 'Rollback Command', hint: 'C R' },
      { id: 'open-latest-failed-command-run', label: 'Inspect Failed Command', hint: 'C F' },
      { id: 'open-latest-failed-playbook-run', label: 'Inspect Failed Playbook', hint: 'P F' },
      { id: 'open-latest-blocked-run', label: 'Inspect Blocked Run', hint: 'X B' },
      { id: 'open-latest-rollback-eligible-run', label: 'Inspect Rollback Window', hint: 'X R' },
    ],
    [],
  );

  const paletteEntries = useMemo(
    () => [
      { id: 'open-ops', label: 'Open Ops Command Center', hint: 'G O' },
      { id: 'open-review', label: 'Open Review Queue', hint: 'G R' },
      { id: 'run-weekly-close', label: 'Run Weekly Close Routine', hint: 'W C' },
      { id: 'create-playbook', label: 'Create Baseline Playbook', hint: 'P C' },
      { id: 'assign-lane', label: 'Assign Delegate Lane', hint: 'D L' },
      { id: 'open-runtime-incidents', label: 'Open Runtime Incident Timeline', hint: 'R I' },
      { id: 'runtime-stabilize', label: 'Stabilize Runtime Pipeline', hint: 'R S' },
      { id: 'runtime-requeue', label: 'Requeue Expired Worker Claims', hint: 'R Q' },
      { id: 'runtime-replay-dead-letters', label: 'Replay Dead Letters', hint: 'R D' },
      { id: 'runtime-start-pipeline', label: 'Start Runtime Pipeline', hint: 'R P' },
      { id: 'resolve-next-action', label: 'Resolve Next Action', hint: 'N A' },
      { id: 'run-triage-chain', label: 'Execute Triage Chain', hint: 'T C' },
      { id: 'run-autopilot-live', label: 'Run Autopilot Live', hint: 'A L' },
      { id: 'rollback-last-playbook-run', label: 'Rollback Last Playbook', hint: 'P R' },
      { id: 'rollback-last-command-run', label: 'Rollback Last Command Run', hint: 'C R' },
      { id: 'open-latest-live-command-run', label: 'Open Latest Live Command Run', hint: 'C L' },
      { id: 'open-latest-failed-command-run', label: 'Open Latest Failed Command Run', hint: 'C F' },
      { id: 'open-latest-blocked-command-run', label: 'Open Latest Blocked Command Run', hint: 'C B' },
      { id: 'open-latest-live-playbook-run', label: 'Open Latest Live Playbook Run', hint: 'P L' },
      { id: 'open-latest-failed-playbook-run', label: 'Open Latest Failed Playbook Run', hint: 'P F' },
      { id: 'open-latest-blocked-playbook-run', label: 'Open Latest Blocked Playbook Run', hint: 'P B' },
      { id: 'open-latest-failed-run', label: 'Open Latest Failed Run', hint: 'X F' },
      { id: 'open-latest-blocked-run', label: 'Open Latest Blocked Run', hint: 'X B' },
      { id: 'open-latest-rollback-eligible-run', label: 'Open Latest Rollback Eligible Run', hint: 'X R' },
      // Finance operations
      { id: 'open-finance', label: 'Finanzen öffnen', hint: 'G F' },
      { id: 'open-quick-add', label: 'Neue Transaktion (Quick Add)', hint: '⌘N' },
      { id: 'open-finance-dashboard', label: 'Finanz-Dashboard', hint: 'F D' },
      { id: 'open-finance-transactions', label: 'Transaktionen', hint: 'F T' },
      { id: 'open-finance-contracts', label: 'Verträge', hint: 'F V' },
      { id: 'open-finance-calendar', label: 'Zahlungskalender', hint: 'F K' },
      { id: 'open-finance-categories', label: 'Kategorien verwalten', hint: 'F C' },
      { id: 'open-finance-review', label: 'Prüfungen / Review Queue', hint: 'F R' },
    ],
    [],
  );

  return {
    moneyPulse,
    recommendations,
    narrativePulse,
    recentRunCandidates,
    latestTerminalRun,
    anomalyTargets,
    anomalyCounts,
    loops,
    shellActions,
    paletteEntries,
  };
}
