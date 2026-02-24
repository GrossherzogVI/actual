import { useMemo, useState } from 'react';

import { useInfiniteQuery } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type { OpsActivityKind, OpsActivitySeverity } from '../../core/types';

import { Button } from '@/components/ui/button';

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

const severityOptions: Array<{
  id: 'all' | OpsActivitySeverity;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'warn', label: 'Warnings' },
  { id: 'info', label: 'Info' },
];

export function OpsActivityFeedPanel({ onRoute }: OpsActivityFeedPanelProps) {
  const [kindFilter, setKindFilter] = useState<'all' | OpsActivityKind>('all');
  const [severityFilter, setSeverityFilter] = useState<
    'all' | OpsActivitySeverity
  >('all');

  const activity = useInfiniteQuery({
    queryKey: ['ops-activity', kindFilter, severityFilter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      apiClient.listOpsActivity({
        limit: 24,
        kinds: kindFilter === 'all' ? undefined : [kindFilter],
        severities: severityFilter === 'all' ? undefined : [severityFilter],
        cursor: pageParam,
      }),
    getNextPageParam: lastPage => lastPage.nextCursor,
    refetchInterval: 8_000,
  });

  const events = useMemo(
    () => (activity.data?.pages || []).flatMap(page => page.events),
    [activity.data],
  );

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>
          Ops Activity Feed
        </h2>
        <small>
          Cross-plane timeline for commands, playbooks, delegates, focus, and
          scenarios.
        </small>
      </header>

      <div className="fo-stack">
        <div className="fo-activity-filters">
          <div className="fo-row">
            {kindOptions.map(option => (
              <Button
                key={option.id}
                variant={kindFilter === option.id ? 'default' : 'secondary'}
                className="fo-chip"
                size="sm"
                onClick={() => setKindFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <div className="fo-row">
            {severityOptions.map(option => (
              <Button
                key={option.id}
                variant={severityFilter === option.id ? 'default' : 'secondary'}
                className="fo-chip"
                size="sm"
                onClick={() => setSeverityFilter(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {activity.isLoading ? (
          <small>Loading activity timeline...</small>
        ) : null}
        {activity.isError ? <small>Activity feed unavailable.</small> : null}
        {!activity.isLoading && events.length === 0 ? (
          <small>No activity matching current filters.</small>
        ) : null}

        <div className="fo-activity-list">
          {events.map(event => (
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
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onRoute(event.route || '/ops')}
                  >Open</Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        {activity.hasNextPage ? (
          <Button
            variant="secondary"
            disabled={activity.isFetchingNextPage}
            onClick={() => {
              void activity.fetchNextPage();
            }}
          >
            {activity.isFetchingNextPage ? 'Loading more...' : 'Load More'}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
