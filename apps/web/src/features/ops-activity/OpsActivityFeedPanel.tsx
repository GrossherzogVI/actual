import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { OpsActivityKind, OpsActivitySeverity } from '../../core/types';
import { apiClient } from '../../core/api/client';

type OpsActivityFeedPanelProps = {
  onRoute: (route: string) => void;
};

const kindOptions: Array<{ id: 'all' | OpsActivityKind; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'workflow-command-run', label: 'Commands' },
  { id: 'workflow-playbook-run', label: 'Playbooks' },
  { id: 'workflow-close-run', label: 'Close Runs' },
  { id: 'focus-action-outcome', label: 'Focus' },
  { id: 'scenario-adoption', label: 'Scenario' },
  { id: 'delegate-lane', label: 'Delegate' },
  { id: 'policy-egress', label: 'Policy' },
];

const severityOptions: Array<{ id: 'all' | OpsActivitySeverity; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'warn', label: 'Warnings' },
  { id: 'info', label: 'Info' },
];

export function OpsActivityFeedPanel({ onRoute }: OpsActivityFeedPanelProps) {
  const [kindFilter, setKindFilter] = useState<'all' | OpsActivityKind>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | OpsActivitySeverity>('all');

  const activity = useQuery({
    queryKey: ['ops-activity', kindFilter, severityFilter],
    queryFn: () =>
      apiClient.listOpsActivity({
        limit: 80,
        kinds: kindFilter === 'all' ? undefined : [kindFilter],
        severities: severityFilter === 'all' ? undefined : [severityFilter],
      }),
    refetchInterval: 8_000,
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Ops Activity Feed</h2>
        <small>Cross-plane timeline for commands, playbooks, delegates, focus, and scenarios.</small>
      </header>

      <div className="fo-stack">
        <div className="fo-activity-filters">
          <div className="fo-row">
            {kindOptions.map(option => (
              <button
                key={option.id}
                className={`fo-chip ${kindFilter === option.id ? 'fo-chip-active' : ''}`}
                type="button"
                onClick={() => setKindFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="fo-row">
            {severityOptions.map(option => (
              <button
                key={option.id}
                className={`fo-chip ${severityFilter === option.id ? 'fo-chip-active' : ''}`}
                type="button"
                onClick={() => setSeverityFilter(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {activity.isLoading ? <small>Loading activity timeline...</small> : null}
        {activity.isError ? <small>Activity feed unavailable.</small> : null}
        {!activity.isLoading && (activity.data || []).length === 0 ? (
          <small>No activity matching current filters.</small>
        ) : null}

        <div className="fo-activity-list">
          {(activity.data || []).map(event => (
            <article
              key={event.id}
              className={`fo-activity-item fo-activity-${event.severity}`}
            >
              <div className="fo-space-between">
                <strong>{event.title}</strong>
                <small>
                  {new Date(event.createdAtMs).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </small>
              </div>
              <small>{event.detail}</small>
              <div className="fo-space-between">
                <code>{event.kind}</code>
                {event.route ? (
                  <button
                    className="fo-btn-secondary"
                    type="button"
                    onClick={() => onRoute(event.route || '/ops')}
                  >
                    Open
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
