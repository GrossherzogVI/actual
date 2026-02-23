import { useQuery } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

type AdaptiveFocusRailProps = {
  onRoute: (route: string) => void;
};

export function AdaptiveFocusRail({ onRoute }: AdaptiveFocusRailProps) {
  const focus = useQuery({
    queryKey: ['focus-panel'],
    queryFn: apiClient.getFocusPanel,
    refetchInterval: 20_000,
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Adaptive Focus</h2>
        <small>Next best actions by urgency and impact.</small>
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
            <button className="fo-btn-secondary" onClick={() => onRoute(action.route)}>
              Open
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
