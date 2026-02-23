import { useCallback, useState } from 'react';

import { motion } from 'motion/react';

import { apiClient } from '../core/api/client';
import { dispatchRunDetailsCommand } from '../features/runtime/run-details-commands';
import { dispatchRuntimeCommand } from '../features/runtime/runtime-commands';
import { AppShell } from './AppShell';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useAppState } from './useAppState';

export function App() {
  const [status, setStatus] = useState('System ready.');
  const [lastRoute, setLastRoute] = useState('/ops');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeLoop, setActiveLoop] = useState('morning');

  const {
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
  } = useAppState();

  const handleRoute = useCallback((route: string) => {
    setLastRoute(route);
    setStatus(`Navigated to ${route}`);
    if (route.includes('/quick-add')) { setActiveLoop('capture'); return; }
    if (route.includes('/review')) { setActiveLoop('triage'); return; }
    if (route.includes('/contracts')) { setActiveLoop('execution'); return; }
    if (route.includes('#spatial-twin')) { setActiveLoop('simulation'); return; }
    if (route.includes('#delegate-lanes')) { setActiveLoop('execution'); return; }
    setActiveLoop('morning');
  }, []);

  const openRunDetailsTarget = useCallback(
    (input: {
      target: { scope: 'command' | 'playbook'; id: string; status: string } | null;
      selector: 'latest-live' | 'latest-failed' | 'latest-blocked' | 'latest-rollback-eligible';
      source: 'palette' | 'shell';
      emptyMessage: string;
      contextLabel: string;
    }) => {
      if (!input.target) { setStatus(input.emptyMessage); return; }
      const route = input.target.scope === 'command' ? '/ops#command-mesh' : '/ops#playbooks';
      handleRoute(route);
      dispatchRunDetailsCommand({ scope: input.target.scope, selector: input.selector, source: input.source });
      setStatus(`${input.contextLabel}: ${input.target.scope} run ${input.target.id} (${input.target.status}).`);
    },
    [handleRoute],
  );

  const runCommand = useCallback(
    async (entryId: string, source: 'palette' | 'shell') => {
      if (entryId === 'open-ops') { handleRoute('/ops'); return; }
      if (entryId === 'open-review') { handleRoute('/review?priority=urgent'); return; }

      if (entryId === 'open-runtime-incidents') {
        handleRoute('/ops#runtime-incidents');
        dispatchRuntimeCommand({ command: 'open-incidents', source });
        return;
      }
      if (entryId === 'runtime-stabilize') { dispatchRuntimeCommand({ command: 'stabilize', source }); setStatus('Runtime stabilize command sent.'); return; }
      if (entryId === 'runtime-requeue') { dispatchRuntimeCommand({ command: 'requeue-expired', source }); setStatus('Runtime requeue command sent.'); return; }
      if (entryId === 'runtime-replay-dead-letters') { dispatchRuntimeCommand({ command: 'replay-dead-letters', source }); setStatus('Runtime replay command sent.'); return; }
      if (entryId === 'runtime-start-pipeline') { dispatchRuntimeCommand({ command: 'start-pipeline', source }); setStatus('Runtime pipeline start command sent.'); return; }

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
        const lane = await apiClient.assignDelegateLane('Follow-up on expiring contracts', 'delegate');
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
          'triage -> expiring<30d -> batch-renegotiate', 'delegate',
          { executionMode: 'dry-run', guardrailProfile: 'balanced', rollbackWindowMinutes: 60, rollbackOnFailure: true },
        );
        setStatus(`Triage chain executed (${run.steps.length} steps, ${run.errorCount} errors).`);
        return;
      }
      if (entryId === 'run-autopilot-live') {
        const run = await apiClient.executeCommandChain(
          'triage -> expiring<30d -> batch-renegotiate -> refresh', 'delegate',
          { executionMode: 'live', guardrailProfile: 'strict', rollbackWindowMinutes: 120, rollbackOnFailure: true },
        );
        setStatus(`Autopilot live run ${run.status} (${run.errorCount} errors).`);
        return;
      }
      if (entryId === 'rollback-last-playbook-run') {
        const latest = (await apiClient.listPlaybookRuns({ limit: 1, executionMode: 'live' }))[0];
        if (!latest) { setStatus('No playbook run available for rollback.'); return; }
        const rb = await apiClient.rollbackPlaybookRun(latest.id, 'palette-rollback');
        setStatus(`Rolled back playbook run via ${rb.id}.`);
        return;
      }
      if (entryId === 'rollback-last-command-run') {
        const latest = (await apiClient.listCommandRuns({ limit: 1, executionMode: 'live' }))[0];
        if (!latest) { setStatus('No command run available for rollback.'); return; }
        const rb = await apiClient.rollbackCommandRun(latest.id, 'palette-rollback');
        setStatus(`Rolled back command run via ${rb.id}.`);
        return;
      }

      // Run details openers
      const runDetailsMap: Record<string, { scopeFilter?: 'command' | 'playbook'; statusFilter?: string; selector: 'latest-live' | 'latest-failed' | 'latest-blocked' | 'latest-rollback-eligible'; empty: string; label: string }> = {
        'open-latest-live-command-run': { scopeFilter: 'command', selector: 'latest-live', empty: 'No live command run found.', label: 'Inspecting latest live' },
        'open-latest-failed-command-run': { scopeFilter: 'command', statusFilter: 'failed', selector: 'latest-failed', empty: 'No failed command run found.', label: 'Inspecting latest failed' },
        'open-latest-blocked-command-run': { scopeFilter: 'command', statusFilter: 'blocked', selector: 'latest-blocked', empty: 'No blocked command run found.', label: 'Inspecting latest blocked' },
        'open-latest-live-playbook-run': { scopeFilter: 'playbook', selector: 'latest-live', empty: 'No live playbook run found.', label: 'Inspecting latest live' },
        'open-latest-failed-playbook-run': { scopeFilter: 'playbook', statusFilter: 'failed', selector: 'latest-failed', empty: 'No failed playbook run found.', label: 'Inspecting latest failed' },
        'open-latest-blocked-playbook-run': { scopeFilter: 'playbook', statusFilter: 'blocked', selector: 'latest-blocked', empty: 'No blocked playbook run found.', label: 'Inspecting latest blocked' },
      };
      const runDetailsConfig = runDetailsMap[entryId];
      if (runDetailsConfig) {
        const target = recentRunCandidates.find(c =>
          (!runDetailsConfig.scopeFilter || c.scope === runDetailsConfig.scopeFilter) &&
          (!runDetailsConfig.statusFilter || c.status === runDetailsConfig.statusFilter),
        ) || null;
        openRunDetailsTarget({ target, selector: runDetailsConfig.selector, source, emptyMessage: runDetailsConfig.empty, contextLabel: runDetailsConfig.label });
        return;
      }

      if (entryId === 'open-latest-failed-run') {
        openRunDetailsTarget({ target: anomalyTargets.failed, selector: 'latest-failed', source, emptyMessage: 'No failed live run found.', contextLabel: 'Inspecting latest failed' });
        return;
      }
      if (entryId === 'open-latest-blocked-run') {
        openRunDetailsTarget({ target: anomalyTargets.blocked, selector: 'latest-blocked', source, emptyMessage: 'No blocked live run found.', contextLabel: 'Inspecting latest blocked' });
        return;
      }
      if (entryId === 'open-latest-rollback-eligible-run') {
        openRunDetailsTarget({ target: anomalyTargets.rollbackEligible, selector: 'latest-rollback-eligible', source, emptyMessage: 'No rollback-eligible live run in open window.', contextLabel: 'Inspecting rollback window' });
      }
    },
    [anomalyTargets, handleRoute, openRunDetailsTarget, recentRunCandidates],
  );

  const executeShellCommand = useCallback((commandId: string) => {
    void runCommand(commandId, 'shell').catch(error => {
      setStatus(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [runCommand]);

  const handlePaletteSelection = useCallback(async (entry: { id: string; label: string }) => {
    setPaletteOpen(false);
    try {
      await runCommand(entry.id, 'palette');
    } catch (error) {
      setStatus(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [runCommand]);

  return (
    <div className="fo-app-shell">
      <KeyboardShortcuts
        loops={loops}
        onTogglePalette={() => setPaletteOpen(prev => !prev)}
        onClosePalette={() => setPaletteOpen(false)}
        onRoute={handleRoute}
        onRunCommand={executeShellCommand}
      />

      <header className="fo-topbar">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }}>
          <h1>Finance OS - Command Center</h1>
          <small>Precision Command Center / Ops Superhuman mode</small>
        </motion.div>

        <motion.div className="fo-metrics" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, staggerChildren: 0.1 }}>
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
        <button className="fo-anomaly-badge fo-anomaly-badge-blocked" type="button" onClick={() => executeShellCommand('open-latest-blocked-run')}>
          <strong>{anomalyCounts.blocked}</strong>
          <small>blocked</small>
          <kbd className="fo-kbd">A+S+B</kbd>
        </button>
        <button className="fo-anomaly-badge fo-anomaly-badge-failed" type="button" onClick={() => executeShellCommand('open-latest-failed-run')}>
          <strong>{anomalyCounts.failed}</strong>
          <small>failed</small>
          <kbd className="fo-kbd">A+S+F</kbd>
        </button>
        <button className="fo-anomaly-badge fo-anomaly-badge-rollback" type="button" onClick={() => executeShellCommand('open-latest-rollback-eligible-run')}>
          <strong>{anomalyCounts.rollbackEligible}</strong>
          <small>rollback window</small>
          <kbd className="fo-kbd">A+S+R</kbd>
        </button>
        <small className="fo-muted-line">live sample: {anomalyCounts.sampleSize} runs</small>
      </nav>

      <AppShell
        recommendations={recommendations.data || []}
        narrativePulseData={narrativePulse.data}
        onStatus={setStatus}
        onRoute={handleRoute}
      />

      <footer className="fo-status-bar">
        <span>{status}</span>
        <code>{lastRoute}</code>
        <code>
          {latestTerminalRun
            ? `run:${latestTerminalRun.status} (${latestTerminalRun.statusPath || 'n/a'}) | rollback:${
                latestTerminalRun.rollbackWindowUntilMs
                  ? latestTerminalRun.rollbackWindowUntilMs > Date.now()
                    ? `open until ${new Date(latestTerminalRun.rollbackWindowUntilMs).toLocaleTimeString()}`
                    : 'window expired'
                  : 'n/a'
              }`
            : 'run: none'}
        </code>
      </footer>

      <CommandPalette
        open={paletteOpen}
        entries={paletteEntries}
        onClose={() => setPaletteOpen(false)}
        onSelect={handlePaletteSelection}
      />
    </div>
  );
}
