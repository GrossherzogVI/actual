import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

type AdaptiveFocusRailProps = {
  onRoute: (route: string) => void;
};

export function AdaptiveFocusRail({ onRoute }: AdaptiveFocusRailProps) {
  const queryClient = useQueryClient();

  const focus = useQuery({
    queryKey: ['focus-panel'],
    queryFn: apiClient.getFocusPanel,
    refetchInterval: 20_000,
  });

  const outcomes = useQuery({
    queryKey: ['focus-outcomes'],
    queryFn: () => apiClient.listActionOutcomes({ limit: 80 }),
    refetchInterval: 20_000,
  });

  const latestOutcomeByAction = useMemo(() => {
    const map = new Map<string, string>();
    for (const outcome of outcomes.data || []) {
      if (!map.has(outcome.actionId)) {
        map.set(outcome.actionId, outcome.outcome);
      }
    }
    return map;
  }, [outcomes.data]);

  const mark = useMutation({
    mutationFn: async (input: { actionId: string; outcome: string }) =>
      apiClient.recordActionOutcome(input.actionId, input.outcome),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-outcomes'] }),
      ]);
    },
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Adaptive Focus</h2>
        <small>Next-best actions shaped by urgency and recent outcomes.</small>
      </header>

      {focus.isLoading ? <small>Loading focus panel...</small> : null}
      {focus.isError ? <small>Focus engine unavailable.</small> : null}

      <div className="fo-stack">
        {(focus.data?.actions || []).map(action => (
          <article key={action.id} className="fo-card">
            <div className="fo-space-between">
              <strong>{action.title}</strong>
              <small>{Math.round(action.score)}</small>
            </div>
            <small>{action.reason}</small>
            <small>
              last outcome: {latestOutcomeByAction.get(action.id) || 'none'}
            </small>
            <div className="fo-row">
              <button
                className="fo-btn-secondary"
                onClick={() => onRoute(action.route)}
                type="button"
              >
                Open
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                disabled={mark.isPending}
                onClick={() =>
                  mark.mutate({
                    actionId: action.id,
                    outcome: 'accepted',
                  })
                }
              >
                Accept
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                disabled={mark.isPending}
                onClick={() =>
                  mark.mutate({
                    actionId: action.id,
                    outcome: 'deferred',
                  })
                }
              >
                Defer
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

