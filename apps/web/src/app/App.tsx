import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  CommandPaletteAdvanced,
  commandCenterTokens,
} from '@finance-os/design-system';

import { apiClient } from '../core/api/client';
import { AdaptiveFocusRail } from '../features/adaptive-focus/AdaptiveFocusRail';
import { CloseLoopPanel } from '../features/close-loop/CloseLoopPanel';
import { CommandMeshPanel } from '../features/command-mesh/CommandMeshPanel';
import { DecisionGraphPanel } from '../features/decision-graph/DecisionGraphPanel';
import { DelegateLanesPanel } from '../features/delegate-lanes/DelegateLanesPanel';
import { PlaybooksPanel } from '../features/ops-playbooks/PlaybooksPanel';
import { SpatialTwinPanel } from '../features/spatial-twin/SpatialTwinPanel';

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

  const paletteEntries = useMemo(
    () => [
      { id: 'open-ops', label: 'Open Ops Command Center', hint: 'G O' },
      { id: 'open-review', label: 'Open Review Queue', hint: 'G R' },
      { id: 'run-weekly-close', label: 'Run Weekly Close Routine', hint: 'W C' },
      { id: 'create-playbook', label: 'Create Baseline Playbook', hint: 'P C' },
      { id: 'assign-lane', label: 'Assign Delegate Lane', hint: 'D L' },
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

  const handlePaletteSelection = async (entry: { id: string; label: string }) => {
    setPaletteOpen(false);

    if (entry.id === 'open-ops') {
      handleRoute('/ops');
      return;
    }

    if (entry.id === 'open-review') {
      handleRoute('/review?priority=urgent');
      return;
    }

    if (entry.id === 'run-weekly-close') {
      const result = await apiClient.runCloseRoutine('weekly');
      setStatus(`Weekly close completed (${result.exceptionCount} exceptions).`);
      return;
    }

    if (entry.id === 'create-playbook') {
      const playbook = await apiClient.createPlaybook('Palette Workflow', [
        { verb: 'resolve-next-action', lane: 'triage' },
        { verb: 'run-close', period: 'weekly' },
      ]);
      setStatus(`Created playbook ${playbook.name}.`);
      return;
    }

    if (entry.id === 'assign-lane') {
      const lane = await apiClient.assignDelegateLane(
        'Follow-up on expiring contracts',
        'delegate',
      );
      setStatus(`Assigned lane ${lane.title}.`);
    }
  };

  return (
    <div className="fo-app-shell">
      <header className="fo-topbar">
        <div>
          <h1>Finance OS - Command Center</h1>
          <small>Precision Command Center / Ops Superhuman mode</small>
        </div>

        <div className="fo-metrics">
          <div className="fo-metric-card">
            <strong>{moneyPulse.data?.pendingReviews ?? '-'}</strong>
            <small>Pending Reviews</small>
          </div>
          <div className="fo-metric-card">
            <strong>{moneyPulse.data?.urgentReviews ?? '-'}</strong>
            <small>Urgent</small>
          </div>
          <div className="fo-metric-card">
            <strong>{moneyPulse.data?.expiringContracts ?? '-'}</strong>
            <small>Expiring 30d</small>
          </div>
        </div>
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

      <main className="fo-main-grid">
        <aside className="fo-column fo-left-column">
          <CloseLoopPanel onStatus={setStatus} />
          <section className="fo-panel">
            <header className="fo-panel-header">
              <h2>Narrative Compression Pulse</h2>
              <small>Actionable summary from recommendation graph.</small>
            </header>
            <div className="fo-stack">
              {(recommendations.data || []).slice(0, 3).map(recommendation => (
                <article className="fo-card" key={recommendation.id}>
                  <strong>{recommendation.title}</strong>
                  <small>{recommendation.rationale}</small>
                  <small>
                    confidence {Math.round(recommendation.confidence * 100)}% - {recommendation.expectedImpact}
                  </small>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <section className="fo-column fo-center-column">
          <CommandMeshPanel onRoute={handleRoute} onStatus={setStatus} />
          <PlaybooksPanel onStatus={setStatus} />
          <SpatialTwinPanel />
          <DecisionGraphPanel recommendations={recommendations.data || []} />
        </section>

        <aside className="fo-column fo-right-column">
          <AdaptiveFocusRail onRoute={handleRoute} />
          <DelegateLanesPanel onStatus={setStatus} />
        </aside>
      </main>

      <footer className="fo-status-bar">
        <span>{status}</span>
        <code>{lastRoute}</code>
      </footer>

      {paletteOpen ? (
        <div className="fo-palette-overlay" role="presentation" onClick={() => setPaletteOpen(false)}>
          <div
            className="fo-palette"
            style={{
              borderColor: commandCenterTokens.color.border,
            }}
            onClick={event => event.stopPropagation()}
          >
            <CommandPaletteAdvanced
              entries={paletteEntries}
              onSelect={handlePaletteSelection}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
