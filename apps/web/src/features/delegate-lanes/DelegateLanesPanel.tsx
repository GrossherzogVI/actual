import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

type DelegateLanesPanelProps = {
  onStatus: (status: string) => void;
};

export function DelegateLanesPanel({ onStatus }: DelegateLanesPanelProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('delegate');

  const lanes = useQuery({
    queryKey: ['delegate-lanes'],
    queryFn: apiClient.listDelegateLanes,
  });

  const assign = useMutation({
    mutationFn: async () => apiClient.assignDelegateLane(title.trim(), assignee.trim()),
    onSuccess: async lane => {
      setTitle('');
      onStatus(`Assigned lane: ${lane.title}`);
      await queryClient.invalidateQueries({ queryKey: ['delegate-lanes'] });
    },
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Delegate Lanes</h2>
        <small>Owner/delegate accountability with explicit handoff states.</small>
      </header>

      <div className="fo-stack">
        <input
          className="fo-input"
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="Lane mission title"
        />
        <input
          className="fo-input"
          value={assignee}
          onChange={event => setAssignee(event.target.value)}
          placeholder="Assignee"
        />
        <button
          className="fo-btn"
          disabled={!title.trim() || !assignee.trim() || assign.isPending}
          onClick={() => assign.mutate()}
        >
          Assign lane
        </button>
      </div>

      <div className="fo-stack">
        {(lanes.data || []).map(lane => (
          <article key={lane.id} className="fo-card">
            <div className="fo-space-between">
              <strong>{lane.title}</strong>
              <small>{lane.status}</small>
            </div>
            <small>
              {lane.assignedBy} -&gt; {lane.assignee}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}
