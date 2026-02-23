import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, type Variants } from 'motion/react';

import {
  CommandPaletteAdvanced,
  commandCenterTokens,
} from '@finance-os/design-system';

import type { PlaybookRun, RunStatus, WorkflowCommandExecution } from '../core/types';
import { apiClient } from '../core/api/client';
import { AdaptiveFocusRail } from '../features/adaptive-focus/AdaptiveFocusRail';
import { CloseLoopPanel } from '../features/close-loop/CloseLoopPanel';
import { CommandMeshPanel } from '../features/command-mesh/CommandMeshPanel';
import { DecisionGraphPanel } from '../features/decision-graph/DecisionGraphPanel';
import { DelegateLanesPanel } from '../features/delegate-lanes/DelegateLanesPanel';
import { PlaybooksPanel } from '../features/ops-playbooks/PlaybooksPanel';
import { OpsActivityFeedPanel } from '../features/ops-activity/OpsActivityFeedPanel';
import { PolicyControlPanel } from '../features/policy/PolicyControlPanel';
import { RuntimeIncidentTimelinePanel } from '../features/runtime/RuntimeIncidentTimelinePanel';
import { RuntimeControlPanel } from '../features/runtime/RuntimeControlPanel';
import { dispatchRunDetailsCommand } from '../features/runtime/run-details-commands';
import { dispatchRuntimeCommand } from '../features/runtime/runtime-commands';
import { SpatialTwinPanel } from '../features/spatial-twin/SpatialTwinPanel';
import { TemporalIntelligencePanel } from '../features/temporal-intelligence/TemporalIntelligencePanel';

type RunAnomalyCandidate = {
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

export function App() {
  const [status, setStatus] = useState('System ready.');
  const [lastRoute, setLastRoute] = useState('/ops');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeLoop, setActiveLoop] = useState('morning');

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
    queryFn: () =>
      apiClient.listCommandRuns({
        limit: 50,
        executionMode: 'live',
      }),
    refetchInterval: 15_000,
  });

  const recentLivePlaybookRuns = useQuery({
    queryKey: ['playbook-runs', 'recent-live'],
    queryFn: () =>
      apiClient.listPlaybookRuns({
        limit: 50,
        executionMode: 'live',
      }),
    refetchInterval: 15_000,
  });

  const recentRunCandidates = useMemo(() => {
    const commandCandidates = (recentLiveCommandRuns.data || []).map(
      toCommandRunCandidate,
    );
    const playbookCandidates = (recentLivePlaybookRuns.data || []).map(
      toPlaybookRunCandidate,
    );
    return [...commandCandidates, ...playbookCandidates].sort(
      (a, b) => b.createdAtMs - a.createdAtMs,
    );
  }, [recentLiveCommandRuns.data, recentLivePlaybookRuns.data]);

  const latestTerminalRun = useMemo(() => {
    const latest = recentRunCandidates[0];
    if (!latest) {
      return null;
    }
    return {
      status: latest.status,
      rollbackWindowUntilMs: latest.rollbackWindowUntilMs,
      createdAtMs: latest.createdAtMs,
      statusPath: latest.statusPath,
    };
  }, [recentRunCandidates]);

  const anomalyTargets = useMemo(() => {
    const now = Date.now();
    const blocked =
      recentRunCandidates.find(candidate => candidate.status === 'blocked') || null;
    const failed =
      recentRunCandidates.find(candidate => candidate.status === 'failed') || null;
    const rollbackEligible =
      recentRunCandidates.find(
        candidate =>
          candidate.rollbackEligible &&
          (candidate.status === 'completed' || candidate.status === 'failed') &&
          typeof candidate.rollbackWindowUntilMs === 'number' &&
          candidate.rollbackWindowUntilMs > now,
      ) || null;
    return {
      blocked,
      failed,
      rollbackEligible,
    };
  }, [recentRunCandidates]);

  const anomalyCounts = useMemo(() => {
    const now = Date.now();
    return {
      blocked: recentRunCandidates.filter(candidate => candidate.status === 'blocked')
        .length,
      failed: recentRunCandidates.filter(candidate => candidate.status === 'failed')
        .length,
      rollbackEligible: recentRunCandidates.filter(
        candidate =>
          candidate.rollbackEligible &&
          (candidate.status === 'completed' || candidate.status === 'failed') &&
          typeof candidate.rollbackWindowUntilMs === 'number' &&
          candidate.rollbackWindowUntilMs > now,
      ).length,
      sampleSize: recentRunCandidates.length,
    };
  }, [recentRunCandidates]);

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
      {
        id: 'open-latest-rollback-eligible-run',
        label: 'Open Latest Rollback Eligible Run',
        hint: 'X R',
      },
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

  const handleRoute = useCallback((route: string) => {
    setLastRoute(route);
    setStatus(`Navigated to ${route}`);
    if (route.includes('/quick-add')) {
      setActiveLoop('capture');
      return;
    }
    if (route.includes('/review')) {
      setActiveLoop('triage');
      return;
    }
    if (route.includes('/contracts')) {
      setActiveLoop('execution');
      return;
    }
    if (route.includes('#spatial-twin')) {
      setActiveLoop('simulation');
      return;
    }
    if (route.includes('#delegate-lanes')) {
      setActiveLoop('execution');
      return;
    }
    setActiveLoop('morning');
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen(open => !open);
      }
      if (event.altKey && /^[1-6]$/.test(event.key)) {
        const loop = loops[Number(event.key) - 1];
        if (loop) {
          event.preventDefault();
          handleRoute(loop.route);
        }
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRoute, loops]);

  const openRunDetailsTarget = useCallback(
    (input: {
      target: RunAnomalyCandidate | null;
      selector:
      | 'latest-live'
      | 'latest-failed'
      | 'latest-blocked'
      | 'latest-rollback-eligible';
      source: 'palette' | 'shell';
      emptyMessage: string;
      contextLabel: string;
    }) => {
      if (!input.target) {
        setStatus(input.emptyMessage);
        return;
      }
      const route =
        input.target.scope === 'command' ? '/ops#command-mesh' : '/ops#playbooks';
      handleRoute(route);
      dispatchRunDetailsCommand({
        scope: input.target.scope,
        selector: input.selector,
        source: input.source,
      });
      setStatus(
        `${input.contextLabel}: ${input.target.scope} run ${input.target.id} (${input.target.status}).`,
      );
    },
    [handleRoute],
  );

  const runCommand = useCallback(
    async (entryId: string, source: 'palette' | 'shell') => {
      if (entryId === 'open-ops') {
        handleRoute('/ops');
        return;
      }

      if (entryId === 'open-review') {
        handleRoute('/review?priority=urgent');
        return;
      }

      if (entryId === 'open-runtime-incidents') {
        handleRoute('/ops#runtime-incidents');
        dispatchRuntimeCommand({ command: 'open-incidents', source });
        return;
      }

      if (entryId === 'runtime-stabilize') {
        dispatchRuntimeCommand({ command: 'stabilize', source });
        setStatus('Runtime stabilize command sent.');
        return;
      }

      if (entryId === 'runtime-requeue') {
        dispatchRuntimeCommand({ command: 'requeue-expired', source });
        setStatus('Runtime requeue command sent.');
        return;
      }

      if (entryId === 'runtime-replay-dead-letters') {
        dispatchRuntimeCommand({ command: 'replay-dead-letters', source });
        setStatus('Runtime replay command sent.');
        return;
      }

      if (entryId === 'runtime-start-pipeline') {
        dispatchRuntimeCommand({ command: 'start-pipeline', source });
        setStatus('Runtime pipeline start command sent.');
        return;
      }

      if (entryId === 'run-weekly-close') {
        const result = await apiClient.runCloseRoutine('weekly');
        setStatus(`Weekly close completed (${result.exceptionCount} exceptions).`);
        return;
      }

      if (entryId === 'create-playbook') {
        const playbook = await apiClient.createPlaybook('Palette Workflow', [
          { verb: 'resolve-next-action', lane: 'triage' },
          { verb: 'run-close', period: 'weekly' },
        ]);
        setStatus(`Created playbook ${playbook.name}.`);
        return;
      }

      if (entryId === 'assign-lane') {
        const lane = await apiClient.assignDelegateLane(
          'Follow-up on expiring contracts',
          'delegate',
        );
        setStatus(`Assigned lane ${lane.title}.`);
        return;
      }

      if (entryId === 'resolve-next-action') {
        const action = await apiClient.resolveNextAction();
        setStatus(`Resolved next action: ${action.title}`);
        handleRoute(action.route);
        return;
      }

      if (entryId === 'run-triage-chain') {
        const run = await apiClient.executeCommandChain(
          'triage -> expiring<30d -> batch-renegotiate',
          'delegate',
          {
            executionMode: 'dry-run',
            guardrailProfile: 'balanced',
            rollbackWindowMinutes: 60,
            rollbackOnFailure: true,
          },
        );
        setStatus(`Triage chain executed (${run.steps.length} steps, ${run.errorCount} errors).`);
        return;
      }

      if (entryId === 'run-autopilot-live') {
        const run = await apiClient.executeCommandChain(
          'triage -> expiring<30d -> batch-renegotiate -> refresh',
          'delegate',
          {
            executionMode: 'live',
            guardrailProfile: 'strict',
            rollbackWindowMinutes: 120,
            rollbackOnFailure: true,
          },
        );
        setStatus(`Autopilot live run ${run.status} (${run.errorCount} errors).`);
        return;
      }

      if (entryId === 'rollback-last-playbook-run') {
        const latestPlaybookRun = (
          await apiClient.listPlaybookRuns({
            limit: 1,
            executionMode: 'live',
          })
        )[0];
        if (!latestPlaybookRun) {
          setStatus('No playbook run available for rollback.');
          return;
        }
        const rolledBack = await apiClient.rollbackPlaybookRun(
          latestPlaybookRun.id,
          'palette-rollback',
        );
        setStatus(`Rolled back playbook run via ${rolledBack.id}.`);
        return;
      }

      if (entryId === 'rollback-last-command-run') {
        const latestCommandRun = (
          await apiClient.listCommandRuns({
            limit: 1,
            executionMode: 'live',
          })
        )[0];
        if (!latestCommandRun) {
          setStatus('No command run available for rollback.');
          return;
        }
        const rolledBack = await apiClient.rollbackCommandRun(
          latestCommandRun.id,
          'palette-rollback',
        );
        setStatus(`Rolled back command run via ${rolledBack.id}.`);
        return;
      }

      if (entryId === 'open-latest-live-command-run') {
        openRunDetailsTarget({
          target:
            recentRunCandidates.find(candidate => candidate.scope === 'command') ||
            null,
          selector: 'latest-live',
          source,
          emptyMessage: 'No live command run found.',
          contextLabel: 'Inspecting latest live',
        });
        return;
      }

      if (entryId === 'open-latest-failed-command-run') {
        openRunDetailsTarget({
          target:
            recentRunCandidates.find(
              candidate =>
                candidate.scope === 'command' && candidate.status === 'failed',
            ) || null,
          selector: 'latest-failed',
          source,
          emptyMessage: 'No failed command run found.',
          contextLabel: 'Inspecting latest failed',
        });
        return;
      }

      if (entryId === 'open-latest-blocked-command-run') {
        openRunDetailsTarget({
          target:
            recentRunCandidates.find(
              candidate =>
                candidate.scope === 'command' && candidate.status === 'blocked',
            ) || null,
          selector: 'latest-blocked',
          source,
          emptyMessage: 'No blocked command run found.',
          contextLabel: 'Inspecting latest blocked',
        });
        return;
      }

      if (entryId === 'open-latest-live-playbook-run') {
        openRunDetailsTarget({
          target:
            recentRunCandidates.find(candidate => candidate.scope === 'playbook') ||
            null,
          selector: 'latest-live',
          source,
          emptyMessage: 'No live playbook run found.',
          contextLabel: 'Inspecting latest live',
        });
        return;
      }

      if (entryId === 'open-latest-failed-playbook-run') {
        openRunDetailsTarget({
          target:
            recentRunCandidates.find(
              candidate =>
                candidate.scope === 'playbook' && candidate.status === 'failed',
            ) || null,
          selector: 'latest-failed',
          source,
          emptyMessage: 'No failed playbook run found.',
          contextLabel: 'Inspecting latest failed',
        });
        return;
      }

      if (entryId === 'open-latest-blocked-playbook-run') {
        openRunDetailsTarget({
          target:
            recentRunCandidates.find(
              candidate =>
                candidate.scope === 'playbook' && candidate.status === 'blocked',
            ) || null,
          selector: 'latest-blocked',
          source,
          emptyMessage: 'No blocked playbook run found.',
          contextLabel: 'Inspecting latest blocked',
        });
        return;
      }

      if (entryId === 'open-latest-failed-run') {
        openRunDetailsTarget({
          target: anomalyTargets.failed,
          selector: 'latest-failed',
          source,
          emptyMessage: 'No failed live run found.',
          contextLabel: 'Inspecting latest failed',
        });
        return;
      }

      if (entryId === 'open-latest-blocked-run') {
        openRunDetailsTarget({
          target: anomalyTargets.blocked,
          selector: 'latest-blocked',
          source,
          emptyMessage: 'No blocked live run found.',
          contextLabel: 'Inspecting latest blocked',
        });
        return;
      }

      if (entryId === 'open-latest-rollback-eligible-run') {
        openRunDetailsTarget({
          target: anomalyTargets.rollbackEligible,
          selector: 'latest-rollback-eligible',
          source,
          emptyMessage: 'No rollback-eligible live run in open window.',
          contextLabel: 'Inspecting rollback window',
        });
      }
    },
    [anomalyTargets, handleRoute, openRunDetailsTarget, recentRunCandidates],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey)) {
        return;
      }

      const key = event.key.toLowerCase();
      const commandId =
        key === 'b'
          ? 'open-latest-blocked-run'
          : key === 'f'
            ? 'open-latest-failed-run'
            : key === 'r'
              ? 'open-latest-rollback-eligible-run'
              : null;

      if (!commandId) {
        return;
      }

      event.preventDefault();
      void runCommand(commandId, 'shell').catch(error => {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Command failed: ${message}`);
      });
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runCommand]);

  const handlePaletteSelection = async (entry: { id: string; label: string }) => {
    setPaletteOpen(false);
    try {
      await runCommand(entry.id, 'palette');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Command failed: ${message}`);
    }
  };

  const executeShellCommand = (commandId: string) => {
    void runCommand(commandId, 'shell').catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Command failed: ${message}`);
    });
  };

  // Motion Variants
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      }
    },
  };

  return (
    <div className="fo-app-shell">
      <header className="fo-topbar">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
          <h1>Finance OS - Command Center</h1>
          <small>Precision Command Center / Ops Superhuman mode</small>
        </motion.div>

        <motion.div
          className="fo-metrics"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, staggerChildren: 0.1 }}
        >
          <motion.div className="fo-metric-card" whileHover={{ scale: 1.05 }}>
            <strong>{moneyPulse.data?.pendingReviews ?? '-'}</strong>
            <small>Pending Reviews</small>
          </motion.div>
          <motion.div className="fo-metric-card" whileHover={{ scale: 1.05 }}>
            <strong>{moneyPulse.data?.urgentReviews ?? '-'}</strong>
            <small>Urgent</small>
          </motion.div>
          <motion.div className="fo-metric-card" whileHover={{ scale: 1.05 }}>
            <strong>{moneyPulse.data?.expiringContracts ?? '-'}</strong>
            <small>Expiring 30d</small>
          </motion.div>
        </motion.div>
      </header>

      <nav className="fo-loop-strip">
        {loops.map(loop => (
          <button
            key={loop.id}
            className={`fo-loop-chip ${activeLoop === loop.id ? 'fo-loop-chip-active' : ''}`}
            type="button"
            onClick={() => handleRoute(loop.route)}
          >
            <span>{loop.label}</span>
            <kbd className="fo-kbd">{loop.hint}</kbd>
          </button>
        ))}
      </nav>

      <nav className="fo-action-strip">
        {shellActions.map(action => (
          <button
            key={action.id}
            className="fo-action-chip"
            type="button"
            onClick={() => executeShellCommand(action.id)}
          >
            <span>{action.label}</span>
            <kbd className="fo-kbd">{action.hint}</kbd>
          </button>
        ))}
      </nav>

      <nav className="fo-anomaly-rail">
        <button
          className="fo-anomaly-badge fo-anomaly-badge-blocked"
          type="button"
          onClick={() => executeShellCommand('open-latest-blocked-run')}
        >
          <strong>{anomalyCounts.blocked}</strong>
          <small>blocked</small>
          <kbd className="fo-kbd">A+S+B</kbd>
        </button>
        <button
          className="fo-anomaly-badge fo-anomaly-badge-failed"
          type="button"
          onClick={() => executeShellCommand('open-latest-failed-run')}
        >
          <strong>{anomalyCounts.failed}</strong>
          <small>failed</small>
          <kbd className="fo-kbd">A+S+F</kbd>
        </button>
        <button
          className="fo-anomaly-badge fo-anomaly-badge-rollback"
          type="button"
          onClick={() => executeShellCommand('open-latest-rollback-eligible-run')}
        >
          <strong>{anomalyCounts.rollbackEligible}</strong>
          <small>rollback window</small>
          <kbd className="fo-kbd">A+S+R</kbd>
        </button>
        <small className="fo-muted-line">
          live sample: {anomalyCounts.sampleSize} runs
        </small>
      </nav>

      <motion.main
        className="fo-main-grid"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <aside className="fo-column fo-left-column">
          <motion.div variants={itemVariants}>
            <CloseLoopPanel onStatus={setStatus} />
          </motion.div>

          <motion.section className="fo-panel" variants={itemVariants}>
            <header className="fo-panel-header">
              <h2>Narrative Compression Pulse</h2>
              <small>Daily briefing compressed into top actionable outcomes.</small>
            </header>
            <div className="fo-stack">
              <motion.article className="fo-card" whileHover={{ scale: 1.01 }}>
                <strong>{narrativePulse.data?.summary || 'Generating pulse...'}</strong>
                <small>
                  Generated:{' '}
                  {narrativePulse.data?.generatedAtMs
                    ? new Date(narrativePulse.data.generatedAtMs).toLocaleTimeString()
                    : '-'}
                </small>
              </motion.article>
              <AnimatePresence>
                {(narrativePulse.data?.highlights || []).map((highlight, index) => (
                  <motion.article
                    className="fo-card"
                    key={highlight}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * index }}
                  >
                    <small>{highlight}</small>
                  </motion.article>
                ))}
              </AnimatePresence>
              {(narrativePulse.data?.actionHints || []).map(hint => (
                <article className="fo-card" key={hint}>
                  <strong>{hint}</strong>
                </article>
              ))}
            </div>
          </motion.section>

          <motion.div variants={itemVariants}>
            <TemporalIntelligencePanel onStatus={setStatus} onRoute={handleRoute} />
          </motion.div>
        </aside>

        <section className="fo-column fo-center-column">
          <motion.div variants={itemVariants}>
            <CommandMeshPanel onRoute={handleRoute} onStatus={setStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <PlaybooksPanel onStatus={setStatus} onRoute={handleRoute} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <SpatialTwinPanel onStatus={setStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <DecisionGraphPanel
              recommendations={recommendations.data || []}
              onStatus={setStatus}
              onRoute={handleRoute}
            />
          </motion.div>
        </section>

        <aside className="fo-column fo-right-column">
          <motion.div variants={itemVariants}>
            <AdaptiveFocusRail onRoute={handleRoute} onStatus={setStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <OpsActivityFeedPanel onRoute={handleRoute} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <RuntimeIncidentTimelinePanel onRoute={handleRoute} onStatus={setStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <DelegateLanesPanel onStatus={setStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <PolicyControlPanel onStatus={setStatus} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <RuntimeControlPanel onStatus={setStatus} />
          </motion.div>
        </aside>
      </motion.main>

      <footer className="fo-status-bar">
        <span>{status}</span>
        <code>{lastRoute}</code>
        <code>
          {latestTerminalRun
            ? `run:${latestTerminalRun.status} (${latestTerminalRun.statusPath || 'n/a'}) | rollback:${latestTerminalRun.rollbackWindowUntilMs
              ? latestTerminalRun.rollbackWindowUntilMs > Date.now()
                ? `open until ${new Date(
                  latestTerminalRun.rollbackWindowUntilMs,
                ).toLocaleTimeString()}`
                : 'window expired'
              : 'n/a'
            }`
            : 'run: none'}
        </code>
      </footer>

      <AnimatePresence>
        {paletteOpen ? (
          <motion.div
            className="fo-palette-overlay"
            role="presentation"
            onClick={() => setPaletteOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="fo-palette"
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                borderColor: commandCenterTokens.color.border,
              }}
              onClick={event => event.stopPropagation()}
            >
              <CommandPaletteAdvanced
                entries={paletteEntries}
                onSelect={handlePaletteSelection}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
