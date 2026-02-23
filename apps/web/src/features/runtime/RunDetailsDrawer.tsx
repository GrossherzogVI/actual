import { useEffect } from 'react';

import type { PlaybookRun, WorkflowCommandExecution } from '../../core/types';

type RunDetails = PlaybookRun | WorkflowCommandExecution;

type RunDetailsDrawerProps = {
  run: RunDetails | null;
  onClose: () => void;
  onRollback?: (runId: string) => void;
  rollbackPending?: boolean;
};

function formatTime(ms?: number) {
  if (typeof ms !== 'number') {
    return 'n/a';
  }
  return new Date(ms).toLocaleString();
}

function canRollback(run: RunDetails): boolean {
  if (!run.rollbackEligible) {
    return false;
  }
  if (!(run.status === 'completed' || run.status === 'failed')) {
    return false;
  }
  if (typeof run.rollbackWindowUntilMs !== 'number') {
    return false;
  }
  return run.rollbackWindowUntilMs > Date.now();
}

function runScopeLabel(run: RunDetails): string {
  return 'playbookId' in run ? 'playbook' : 'command-chain';
}

export function RunDetailsDrawer({
  run,
  onClose,
  onRollback,
  rollbackPending,
}: RunDetailsDrawerProps) {
  useEffect(() => {
    if (!run) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [run, onClose]);

  if (!run) {
    return null;
  }

  const rollbackAllowed = canRollback(run);

  return (
    <div
      className="fo-run-drawer-overlay"
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside className="fo-run-drawer" role="dialog" aria-modal="true" aria-label="Run details drawer">
        <header className="fo-run-drawer-header">
          <div className="fo-stack">
            <strong>Run details</strong>
            <small>
              {runScopeLabel(run)} · {run.executionMode} · {run.id}
            </small>
          </div>
          <button className="fo-btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <section className="fo-run-drawer-grid">
          <small>
            status: <strong>{run.status}</strong>
          </small>
          <small>started: {formatTime(run.startedAtMs)}</small>
          <small>finished: {formatTime(run.finishedAtMs)}</small>
          <small>actor: {run.actorId}</small>
          <small>surface: {run.sourceSurface}</small>
          <small>errors: {run.errorCount}</small>
          <small>
            rollback:{' '}
            {rollbackAllowed
              ? `eligible until ${formatTime(run.rollbackWindowUntilMs)}`
              : 'not eligible'}
          </small>
          <small>
            rollbackOf: {run.rollbackOfRunId || 'n/a'}
          </small>
          <small>
            idempotency: {run.idempotencyKey || 'none'}
          </small>
          {'playbookId' in run ? (
            <small>
              playbookId: {run.playbookId} · executed steps: {run.executedSteps}
            </small>
          ) : (
            <small>chain steps: {run.steps.length}</small>
          )}
        </section>

        <section className="fo-run-drawer-section">
          <strong>Status timeline</strong>
          <div className="fo-run-drawer-list">
            {run.statusTimeline.length === 0 ? (
              <small className="fo-muted-line">No status transitions recorded.</small>
            ) : (
              run.statusTimeline.map((transition, index) => (
                <article
                  key={`${transition.status}-${transition.atMs}-${index}`}
                  className="fo-run-drawer-item"
                >
                  <div className="fo-space-between">
                    <small className="fo-run-drawer-pill">{transition.status}</small>
                    <small>{formatTime(transition.atMs)}</small>
                  </div>
                  <small>{transition.note || 'No note.'}</small>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="fo-run-drawer-section">
          <strong>Guardrails</strong>
          <div className="fo-run-drawer-list">
            {run.guardrailResults.length === 0 ? (
              <small className="fo-muted-line">No guardrail findings.</small>
            ) : (
              run.guardrailResults.map(result => (
                <article key={result.ruleId} className="fo-run-drawer-item">
                  <div className="fo-space-between">
                    <small>
                      {result.ruleId} · {result.severity}
                    </small>
                    <small className="fo-run-drawer-pill">
                      {result.passed ? 'pass' : 'fail'}
                    </small>
                  </div>
                  <small>{result.message}</small>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="fo-run-drawer-section">
          <strong>Effects</strong>
          <div className="fo-run-drawer-list">
            {run.effectSummaries.length === 0 ? (
              <small className="fo-muted-line">No effect summaries.</small>
            ) : (
              run.effectSummaries.map(effect => (
                <article key={effect.effectId} className="fo-run-drawer-item">
                  <div className="fo-space-between">
                    <small>{effect.kind}</small>
                    <small className="fo-run-drawer-pill">{effect.status}</small>
                  </div>
                  <small>
                    {effect.description} · reversible: {effect.reversible ? 'yes' : 'no'}
                  </small>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="fo-run-drawer-section">
          <strong>{'playbookId' in run ? 'Executed commands' : 'Command steps'}</strong>
          <div className="fo-run-drawer-list">
            {'playbookId' in run ? (
              run.steps.length === 0 ? (
                <small className="fo-muted-line">No step execution details.</small>
              ) : (
                run.steps.map(step => (
                  <article key={`${run.id}-${step.index}`} className="fo-run-drawer-item">
                    <div className="fo-space-between">
                      <small>
                        #{step.index + 1} · {String(step.command.verb || 'unknown')}
                      </small>
                      <small className="fo-run-drawer-pill">{step.status}</small>
                    </div>
                    <small>{step.detail || 'No detail.'}</small>
                  </article>
                ))
              )
            ) : run.steps.length === 0 ? (
              <small className="fo-muted-line">No step execution details.</small>
            ) : (
              run.steps.map((step, index) => (
                <article key={`${run.id}-${index}`} className="fo-run-drawer-item">
                  <div className="fo-space-between">
                    <small>
                      #{index + 1} · {step.raw}
                    </small>
                    <small className="fo-run-drawer-pill">{step.status}</small>
                  </div>
                  <small>{step.detail}</small>
                </article>
              ))
            )}
          </div>
        </section>

        <footer className="fo-run-drawer-footer">
          <button className="fo-btn-secondary" type="button" onClick={onClose}>
            Close
          </button>
          <button
            className="fo-btn-secondary"
            type="button"
            disabled={!rollbackAllowed || !onRollback || rollbackPending}
            onClick={() => onRollback?.(run.id)}
          >
            {rollbackPending ? 'Rolling back...' : 'Rollback from details'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
