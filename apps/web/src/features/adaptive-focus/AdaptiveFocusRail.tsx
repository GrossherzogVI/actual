import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type { ActionOutcome } from '../../core/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AdaptiveFocusRailProps = {
  onRoute: (route: string) => void;
  onStatus?: (status: string) => void;
};

function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function messageFromError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

function formatOutcome(outcome: string): string {
  if (!outcome) {
    return 'none';
  }
  return outcome.replaceAll('-', ' ');
}

function isOutcomeRecent(outcome: ActionOutcome): boolean {
  const ageMs = Date.now() - outcome.recordedAtMs;
  return ageMs <= 3 * 24 * 60 * 60 * 1000;
}

export function AdaptiveFocusRail({ onRoute, onStatus }: AdaptiveFocusRailProps) {
  const queryClient = useQueryClient();
  const [selectedActionId, setSelectedActionId] = useState('');
  const [note, setNote] = useState('');

  const focus = useQuery({
    queryKey: ['focus-panel'],
    queryFn: apiClient.getFocusPanel,
    refetchInterval: 20_000,
  });

  const outcomes = useQuery({
    queryKey: ['focus-outcomes'],
    queryFn: () => apiClient.listActionOutcomes({ limit: 120 }),
    refetchInterval: 20_000,
  });

  const rankedActions = useMemo(
    () => (focus.data?.actions || []).slice().sort((a, b) => b.score - a.score),
    [focus.data?.actions],
  );

  const latestOutcomeByAction = useMemo(() => {
    const map = new Map<string, ActionOutcome>();
    for (const outcome of outcomes.data || []) {
      if (!map.has(outcome.actionId)) {
        map.set(outcome.actionId, outcome);
      }
    }
    return map;
  }, [outcomes.data]);

  const selectedAction =
    rankedActions.find(action => action.id === selectedActionId) || rankedActions[0];

  const selectedActionOutcomes = useMemo(
    () =>
      (outcomes.data || [])
        .filter(outcome => outcome.actionId === selectedAction?.id)
        .slice(0, 6),
    [outcomes.data, selectedAction?.id],
  );

  const recordOutcome = useMutation({
    mutationFn: async (input: { actionId: string; outcome: string; notes?: string }) =>
      apiClient.recordActionOutcome(input.actionId, input.outcome, input.notes),
    onSuccess: async (_, input) => {
      if (onStatus) {
        onStatus(`Recorded "${formatOutcome(input.outcome)}" for ${input.actionId}.`);
      }
      setNote('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-outcomes'] }),
        queryClient.invalidateQueries({ queryKey: ['ops-activity'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Record focus outcome failed'));
      }
    },
  });

  const acceptTopActions = useMutation({
    mutationFn: async (limit: number) => {
      const top = rankedActions.slice(0, limit);
      for (const action of top) {
        await apiClient.recordActionOutcome(
          action.id,
          'accepted',
          'bulk-accept-top',
        );
      }
      return top.length;
    },
    onSuccess: async acceptedCount => {
      if (onStatus) {
        onStatus(`Accepted top ${acceptedCount} focus actions.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-outcomes'] }),
      ]);
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Bulk accept failed'));
      }
    },
  });

  const runResolveNext = useMutation({
    mutationFn: apiClient.resolveNextAction,
    onSuccess: action => {
      onRoute(action.route);
      if (onStatus) {
        onStatus(`Resolved next action: ${action.title}`);
      }
    },
    onError: error => {
      if (onStatus) {
        onStatus(messageFromError(error, 'Resolve next action failed'));
      }
    },
  });

  const applyOutcome = (outcome: 'accepted' | 'deferred' | 'rejected') => {
    if (!selectedAction) {
      return;
    }
    recordOutcome.mutate({
      actionId: selectedAction.id,
      outcome,
      notes: note.trim() || undefined,
    });
  };

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Adaptive Focus Workbench</h2>
        <small>Ranked action lane with single-action depth and batch execution controls.</small>
      </header>

      {focus.isLoading ? <small>Loading focus panel...</small> : null}
      {focus.isError ? <small>Focus engine unavailable.</small> : null}

      <div className="fo-row">
        <Button
          variant="secondary"
          disabled={runResolveNext.isPending}
          onClick={() => runResolveNext.mutate()}
        >
          {runResolveNext.isPending ? 'Resolving...' : 'Resolve Next + Open'}
        </Button>
        <Button
          variant="secondary"
          disabled={acceptTopActions.isPending || rankedActions.length === 0}
          onClick={() => acceptTopActions.mutate(3)}
        >
          {acceptTopActions.isPending ? 'Applying...' : 'Accept Top 3'}
        </Button>
      </div>

      <div className="fo-focus-workbench">
        <div className="fo-focus-list">
          {rankedActions.map(action => {
            const isSelected = selectedAction?.id === action.id;
            const latestOutcome = latestOutcomeByAction.get(action.id);
            const score = normalizeScore(action.score);

            return (
              <button
                key={action.id}
                className={`fo-focus-item ${isSelected ? 'fo-focus-item-selected' : ''}`}
                type="button"
                onClick={() => setSelectedActionId(action.id)}
              >
                <div className="fo-space-between">
                  <strong>{action.title}</strong>
                  <small>{score}</small>
                </div>
                <div className="fo-focus-score-track">
                  <span
                    className="fo-focus-score-fill"
                    style={{ width: `${score}%` }}
                  />
                </div>
                <small>{action.reason}</small>
                <small>
                  last: {latestOutcome ? formatOutcome(latestOutcome.outcome) : 'none'}
                </small>
              </button>
            );
          })}
        </div>

        <div className="fo-focus-detail">
          {selectedAction ? (
            <>
              <div className="fo-space-between">
                <strong>{selectedAction.title}</strong>
                <small>score {normalizeScore(selectedAction.score)}</small>
              </div>
              <small>{selectedAction.reason}</small>
              <small>
                route: <code>{selectedAction.route}</code>
              </small>

              <Input
                value={note}
                onChange={event => setNote(event.target.value)}
                placeholder="Outcome note (optional)"
              />

              <div className="fo-row pt-1">
                <Button
                  variant="secondary"
                  onClick={() => onRoute(selectedAction.route)}
                >
                  Open
                </Button>
                <Button
                  variant="secondary"
                  disabled={recordOutcome.isPending}
                  onClick={() => applyOutcome('accepted')}
                >
                  Accept
                </Button>
                <Button
                  variant="secondary"
                  disabled={recordOutcome.isPending}
                  onClick={() => applyOutcome('deferred')}
                >
                  Defer
                </Button>
                <Button
                  variant="secondary"
                  disabled={recordOutcome.isPending}
                  onClick={() => applyOutcome('rejected')}
                >
                  Reject
                </Button>
              </div>

              <div className="fo-focus-outcomes">
                {selectedActionOutcomes.length === 0 ? (
                  <small className="fo-muted-line">No recent outcomes for this action.</small>
                ) : (
                  selectedActionOutcomes.map(outcome => (
                    <article
                      key={outcome.id}
                      className={`fo-focus-outcome ${isOutcomeRecent(outcome) ? 'fo-focus-outcome-recent' : ''}`}
                    >
                      <div className="fo-space-between">
                        <strong>{formatOutcome(outcome.outcome)}</strong>
                        <small>{new Date(outcome.recordedAtMs).toLocaleTimeString()}</small>
                      </div>
                      {outcome.notes ? <small>{outcome.notes}</small> : null}
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <small className="fo-muted-line">No focus actions available.</small>
          )}
        </div>
      </div>
    </section>
  );
}
