import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DelegateLane } from '../../core/types';
import { apiClient } from '../../core/api/client';

type DelegateLanesPanelProps = {
  onStatus: (status: string) => void;
};

type LaneStatusFilter = DelegateLane['status'] | 'all';

const laneStatusOrder: DelegateLane['status'][] = [
  'assigned',
  'accepted',
  'completed',
  'rejected',
];

function formatDate(ms?: number) {
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString();
}

function formatDateTime(ms?: number) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

export function DelegateLanesPanel({ onStatus }: DelegateLanesPanelProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('delegate');
  const [priority, setPriority] = useState<DelegateLane['priority']>('normal');
  const [dueDate, setDueDate] = useState('');

  const [statusFilter, setStatusFilter] = useState<LaneStatusFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selectedLaneId, setSelectedLaneId] = useState<string>('');
  const [comment, setComment] = useState('');

  const laneFilters = useMemo(
    () => ({
      limit: 100,
      status: statusFilter === 'all' ? undefined : statusFilter,
      assignee: assigneeFilter.trim() || undefined,
    }),
    [assigneeFilter, statusFilter],
  );

  const lanes = useQuery({
    queryKey: ['delegate-lanes', laneFilters],
    queryFn: () => apiClient.listDelegateLanes(laneFilters),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!selectedLaneId && lanes.data?.[0]) {
      setSelectedLaneId(lanes.data[0].id);
      return;
    }
    if (
      selectedLaneId &&
      lanes.data &&
      !lanes.data.some(lane => lane.id === selectedLaneId)
    ) {
      setSelectedLaneId(lanes.data[0]?.id || '');
    }
  }, [lanes.data, selectedLaneId]);

  const selectedLane =
    (lanes.data || []).find(lane => lane.id === selectedLaneId) || null;

  const laneEvents = useQuery({
    queryKey: ['delegate-lane-events', selectedLaneId],
    queryFn: () => apiClient.listDelegateLaneEvents(selectedLaneId, 120),
    enabled: !!selectedLaneId,
  });

  const assign = useMutation({
    mutationFn: async () => {
      const dueAtMs = dueDate ? new Date(`${dueDate}T10:00:00`).getTime() : undefined;
      return apiClient.assignDelegateLane(title.trim(), assignee.trim(), {
        priority,
        dueAtMs: Number.isFinite(dueAtMs) ? dueAtMs : undefined,
      });
    },
    onSuccess: async lane => {
      setTitle('');
      setDueDate('');
      setSelectedLaneId(lane.id);
      onStatus(`Assigned lane: ${lane.title}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['delegate-lanes'] }),
        queryClient.invalidateQueries({ queryKey: ['delegate-lane-events'] }),
      ]);
    },
  });

  const transition = useMutation({
    mutationFn: async (input: {
      laneId: string;
      next: 'accepted' | 'completed' | 'rejected' | 'assigned';
    }) => {
      if (input.next === 'accepted') {
        return apiClient.acceptDelegateLane(input.laneId);
      }
      if (input.next === 'completed') {
        return apiClient.completeDelegateLane(input.laneId);
      }
      if (input.next === 'rejected') {
        return apiClient.rejectDelegateLane(input.laneId);
      }
      return apiClient.reopenDelegateLane(input.laneId);
    },
    onSuccess: async lane => {
      onStatus(`Lane ${lane.title}: ${lane.status}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['delegate-lanes'] }),
        queryClient.invalidateQueries({ queryKey: ['delegate-lane-events'] }),
      ]);
    },
  });

  const addComment = useMutation({
    mutationFn: async (laneId: string) =>
      apiClient.commentDelegateLane(laneId, comment.trim(), {
        source: 'delegate-lanes-panel',
      }),
    onSuccess: async () => {
      setComment('');
      onStatus('Delegate lane note added.');
      await queryClient.invalidateQueries({ queryKey: ['delegate-lane-events'] });
    },
  });

  return (
    <section className="fo-panel" id="delegate-lanes">
      <header className="fo-panel-header">
        <h2>Delegate Mission Lanes</h2>
        <small>Owner/delegate accountability with explicit handoff and timeline.</small>
      </header>

      <div className="fo-stack">
        <div className="fo-row">
          <input
            className="fo-input"
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Mission title"
          />
        </div>

        <div className="fo-row">
          <input
            className="fo-input"
            value={assignee}
            onChange={event => setAssignee(event.target.value)}
            placeholder="Assignee"
          />
          <select
            className="fo-input"
            value={priority}
            onChange={event =>
              setPriority(event.target.value as DelegateLane['priority'])
            }
          >
            <option value="low">low</option>
            <option value="normal">normal</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>

        <div className="fo-row">
          <input
            className="fo-input"
            type="date"
            value={dueDate}
            onChange={event => setDueDate(event.target.value)}
          />
          <button
            className="fo-btn"
            disabled={!title.trim() || !assignee.trim() || assign.isPending}
            onClick={() => assign.mutate()}
            type="button"
          >
            Assign lane
          </button>
        </div>
      </div>

      <div className="fo-row">
        <select
          className="fo-input"
          value={statusFilter}
          onChange={event => setStatusFilter(event.target.value as LaneStatusFilter)}
        >
          <option value="all">all statuses</option>
          {laneStatusOrder.map(status => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <input
          className="fo-input"
          value={assigneeFilter}
          onChange={event => setAssigneeFilter(event.target.value)}
          placeholder="Filter assignee"
        />
      </div>

      <div className="fo-delegate-grid">
        <div className="fo-stack">
          {(lanes.data || []).map(lane => (
            <article
              key={lane.id}
              className={`fo-card fo-lane-card fo-lane-${lane.status} ${
                selectedLaneId === lane.id ? 'fo-lane-selected' : ''
              }`}
              onClick={() => setSelectedLaneId(lane.id)}
              role="button"
              tabIndex={0}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedLaneId(lane.id);
                }
              }}
            >
              <div className="fo-space-between">
                <strong>{lane.title}</strong>
                <small className={`fo-lane-status fo-lane-status-${lane.status}`}>
                  {lane.status}
                </small>
              </div>
              <small>
                {lane.assignedBy} -&gt; {lane.assignee}
              </small>
              <small>priority: {lane.priority}</small>
              <small>due: {formatDate(lane.dueAtMs)}</small>
              <small>updated: {formatDateTime(lane.updatedAtMs)}</small>

              <div className="fo-row">
                {lane.status === 'assigned' ? (
                  <>
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        transition.mutate({ laneId: lane.id, next: 'accepted' });
                      }}
                    >
                      Accept
                    </button>
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        transition.mutate({ laneId: lane.id, next: 'rejected' });
                      }}
                    >
                      Reject
                    </button>
                  </>
                ) : null}

                {lane.status === 'accepted' ? (
                  <>
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        transition.mutate({ laneId: lane.id, next: 'completed' });
                      }}
                    >
                      Complete
                    </button>
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        transition.mutate({ laneId: lane.id, next: 'rejected' });
                      }}
                    >
                      Reject
                    </button>
                  </>
                ) : null}

                {lane.status === 'completed' || lane.status === 'rejected' ? (
                  <button
                    className="fo-btn-secondary"
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      transition.mutate({ laneId: lane.id, next: 'assigned' });
                    }}
                  >
                    Reopen
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <section className="fo-card fo-lane-detail">
          {selectedLane ? (
            <>
              <div className="fo-space-between">
                <strong>{selectedLane.title}</strong>
                <small>{selectedLane.priority}</small>
              </div>
              <small>
                {selectedLane.assignedBy} -&gt; {selectedLane.assignee}
              </small>
              <small>due: {formatDateTime(selectedLane.dueAtMs)}</small>
              <small>accepted: {formatDateTime(selectedLane.acceptedAtMs)}</small>
              <small>completed: {formatDateTime(selectedLane.completedAtMs)}</small>
              <small>rejected: {formatDateTime(selectedLane.rejectedAtMs)}</small>

              <div className="fo-stack">
                <strong>Lane timeline</strong>
                <div className="fo-log-list">
                  {(laneEvents.data || []).map(event => (
                    <article className="fo-log" key={event.id}>
                      <strong>{event.type}</strong>
                      <small>{event.actorId}</small>
                      <small>{event.message || '-'}</small>
                      <small>{formatDateTime(event.createdAtMs)}</small>
                    </article>
                  ))}
                </div>
              </div>

              <div className="fo-stack">
                <textarea
                  className="fo-input"
                  rows={3}
                  value={comment}
                  onChange={event => setComment(event.target.value)}
                  placeholder="Add mission note"
                />
                <button
                  className="fo-btn"
                  type="button"
                  disabled={!comment.trim() || addComment.isPending}
                  onClick={() => addComment.mutate(selectedLane.id)}
                >
                  Add note
                </button>
              </div>
            </>
          ) : (
            <small>Select a lane to inspect lifecycle timeline.</small>
          )}
        </section>
      </div>
    </section>
  );
}
