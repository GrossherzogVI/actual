import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DelegateLane } from '../../core/types';
import { apiClient } from '../../core/api/client';

type DelegateLanesPanelProps = {
  onStatus: (status: string) => void;
};

type LaneStatusFilter = DelegateLane['status'] | 'all';
type LanePriorityFilter = DelegateLane['priority'] | 'all';
type LaneRiskFilter =
  | 'all'
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'overdue'
  | 'due-soon';
type LaneRiskTier = 'critical' | 'high' | 'medium' | 'low';
type LaneTransitionTarget = 'accepted' | 'completed' | 'rejected' | 'assigned';

const laneStatusOrder: DelegateLane['status'][] = [
  'assigned',
  'accepted',
  'completed',
  'rejected',
];

const priorityScore: Record<DelegateLane['priority'], number> = {
  low: 1,
  normal: 2,
  high: 3,
  critical: 4,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function formatDate(ms?: number) {
  if (!ms) return '-';
  return new Date(ms).toLocaleDateString();
}

function formatDateTime(ms?: number) {
  if (!ms) return '-';
  return new Date(ms).toLocaleString();
}

function dueLabel(ms?: number, nowMs = Date.now()) {
  if (!ms) return 'no due date';
  const diffDays = (ms - nowMs) / MS_PER_DAY;
  if (diffDays < 0) {
    const overdueDays = Math.max(1, Math.floor(Math.abs(diffDays)));
    return `overdue by ${overdueDays}d`;
  }
  if (diffDays < 1) return 'due today';
  if (diffDays < 2) return 'due tomorrow';
  if (diffDays < 7) return `due in ${Math.ceil(diffDays)}d`;
  return `due ${formatDate(ms)}`;
}

function canTransition(current: DelegateLane['status'], next: LaneTransitionTarget) {
  if (current === 'assigned') return next === 'accepted' || next === 'rejected';
  if (current === 'accepted') return next === 'completed' || next === 'rejected';
  return next === 'assigned';
}

function transitionLabel(next: LaneTransitionTarget) {
  if (next === 'accepted') return 'Accept';
  if (next === 'completed') return 'Complete';
  if (next === 'rejected') return 'Reject';
  return 'Reopen';
}

function computeLaneRisk(lane: DelegateLane, nowMs: number) {
  const priority = priorityScore[lane.priority] * 1.6;
  const dueAtMs = lane.dueAtMs || 0;
  const dueDelta = dueAtMs > 0 ? dueAtMs - nowMs : Number.POSITIVE_INFINITY;
  const overdue = dueAtMs > 0 && dueDelta < 0 && lane.status !== 'completed';
  const dueSoon =
    dueAtMs > 0 &&
    dueDelta >= 0 &&
    dueDelta <= 72 * 60 * 60 * 1000 &&
    lane.status !== 'completed';

  let dueScore = 0;
  if (overdue) dueScore = 4;
  else if (dueSoon) dueScore = 2.6;
  else if (dueAtMs > 0 && dueDelta <= 7 * MS_PER_DAY) dueScore = 1.4;

  const statusScore =
    lane.status === 'assigned'
      ? 1.4
      : lane.status === 'accepted'
        ? 1
        : lane.status === 'rejected'
          ? 0.8
          : -0.6;

  const score = priority + dueScore + statusScore;
  const tier: LaneRiskTier =
    overdue || score >= 7 ? 'critical' : score >= 5.2 ? 'high' : score >= 3.8 ? 'medium' : 'low';

  return {
    score,
    tier,
    overdue,
    dueSoon,
  };
}

async function applyLaneTransition(laneId: string, next: LaneTransitionTarget) {
  if (next === 'accepted') {
    return apiClient.acceptDelegateLane(laneId);
  }
  if (next === 'completed') {
    return apiClient.completeDelegateLane(laneId);
  }
  if (next === 'rejected') {
    return apiClient.rejectDelegateLane(laneId);
  }
  return apiClient.reopenDelegateLane(laneId);
}

export function DelegateLanesPanel({ onStatus }: DelegateLanesPanelProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('delegate');
  const [priority, setPriority] = useState<DelegateLane['priority']>('normal');
  const [dueDate, setDueDate] = useState('');

  const [statusFilter, setStatusFilter] = useState<LaneStatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<LanePriorityFilter>('all');
  const [riskFilter, setRiskFilter] = useState<LaneRiskFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedLaneId, setSelectedLaneId] = useState('');
  const [selectedLaneIds, setSelectedLaneIds] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const laneFilters = useMemo(
    () => ({
      limit: 140,
      status: statusFilter === 'all' ? undefined : statusFilter,
      assignee: assigneeFilter.trim() || undefined,
      priority: priorityFilter === 'all' ? undefined : priorityFilter,
    }),
    [assigneeFilter, priorityFilter, statusFilter],
  );

  const lanes = useQuery({
    queryKey: ['delegate-lanes', laneFilters],
    queryFn: () => apiClient.listDelegateLanes(laneFilters),
    refetchInterval: 30_000,
  });

  const lanesWithRisk = useMemo(
    () =>
      (lanes.data || []).map(lane => ({
        lane,
        risk: computeLaneRisk(lane, nowMs),
      })),
    [lanes.data, nowMs],
  );

  const visibleLanes = useMemo(() => {
    const query = searchFilter.trim().toLowerCase();
    const filtered = lanesWithRisk.filter(({ lane, risk }) => {
      if (riskFilter === 'critical' && risk.tier !== 'critical') return false;
      if (riskFilter === 'high' && risk.tier !== 'high') return false;
      if (riskFilter === 'medium' && risk.tier !== 'medium') return false;
      if (riskFilter === 'low' && risk.tier !== 'low') return false;
      if (riskFilter === 'overdue' && !risk.overdue) return false;
      if (riskFilter === 'due-soon' && !risk.dueSoon) return false;
      if (!query) return true;

      return (
        lane.title.toLowerCase().includes(query) ||
        lane.assignee.toLowerCase().includes(query) ||
        lane.assignedBy.toLowerCase().includes(query)
      );
    });

    return filtered.sort((left, right) => {
      if (right.risk.score !== left.risk.score) {
        return right.risk.score - left.risk.score;
      }
      return right.lane.updatedAtMs - left.lane.updatedAtMs;
    });
  }, [lanesWithRisk, riskFilter, searchFilter]);

  useEffect(() => {
    if (!selectedLaneId && visibleLanes[0]) {
      setSelectedLaneId(visibleLanes[0].lane.id);
      return;
    }
    if (
      selectedLaneId &&
      !visibleLanes.some(entry => entry.lane.id === selectedLaneId) &&
      visibleLanes[0]
    ) {
      setSelectedLaneId(visibleLanes[0].lane.id);
    }
  }, [selectedLaneId, visibleLanes]);

  useEffect(() => {
    setSelectedLaneIds(current =>
      current.filter(id => visibleLanes.some(entry => entry.lane.id === id)),
    );
  }, [visibleLanes]);

  const selectedLaneEntry =
    visibleLanes.find(entry => entry.lane.id === selectedLaneId) ||
    lanesWithRisk.find(entry => entry.lane.id === selectedLaneId) ||
    null;
  const selectedLane = selectedLaneEntry?.lane || null;
  const selectedLaneRisk = selectedLaneEntry?.risk || null;

  const laneEvents = useQuery({
    queryKey: ['delegate-lane-events', selectedLaneId],
    queryFn: () => apiClient.listDelegateLaneEvents(selectedLaneId, 140),
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
      next: LaneTransitionTarget;
      source: 'single' | 'batch';
    }) => applyLaneTransition(input.laneId, input.next),
    onSuccess: async lane => {
      onStatus(`Lane ${lane.title}: ${lane.status}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['delegate-lanes'] }),
        queryClient.invalidateQueries({ queryKey: ['delegate-lane-events'] }),
      ]);
    },
  });

  const batchTransition = useMutation({
    mutationFn: async (input: { laneIds: string[]; next: LaneTransitionTarget }) => {
      let successCount = 0;
      let failureCount = 0;

      for (const laneId of input.laneIds) {
        try {
          await applyLaneTransition(laneId, input.next);
          successCount += 1;
        } catch {
          failureCount += 1;
        }
      }

      return {
        next: input.next,
        successCount,
        failureCount,
      };
    },
    onSuccess: async result => {
      if (result.successCount > 0) {
        onStatus(
          `${transitionLabel(result.next)} batch: ${result.successCount} succeeded` +
            (result.failureCount > 0 ? ` / ${result.failureCount} failed` : ''),
        );
      } else {
        onStatus(`No lanes transitioned (${result.failureCount} failed).`);
      }
      setSelectedLaneIds([]);
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

  const missionStats = useMemo(() => {
    const active = lanesWithRisk.filter(
      entry => entry.lane.status === 'assigned' || entry.lane.status === 'accepted',
    );
    const overdue = active.filter(entry => entry.risk.overdue).length;
    const dueSoon = active.filter(entry => entry.risk.dueSoon).length;
    const critical = active.filter(entry => entry.risk.tier === 'critical').length;
    return {
      active: active.length,
      overdue,
      dueSoon,
      critical,
    };
  }, [lanesWithRisk]);

  const selectedEntries = useMemo(
    () => visibleLanes.filter(entry => selectedLaneIds.includes(entry.lane.id)),
    [selectedLaneIds, visibleLanes],
  );

  const batchCandidates = useMemo(() => {
    const byTarget = (next: LaneTransitionTarget) =>
      selectedEntries
        .filter(entry => canTransition(entry.lane.status, next))
        .map(entry => entry.lane.id);

    return {
      accepted: byTarget('accepted'),
      completed: byTarget('completed'),
      rejected: byTarget('rejected'),
      assigned: byTarget('assigned'),
    };
  }, [selectedEntries]);

  const toggleSelectedLane = useCallback((laneId: string) => {
    setSelectedLaneIds(current =>
      current.includes(laneId) ? current.filter(id => id !== laneId) : [...current, laneId],
    );
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedLaneIds(visibleLanes.map(entry => entry.lane.id));
  }, [visibleLanes]);

  const clearSelection = useCallback(() => {
    setSelectedLaneIds([]);
  }, []);

  return (
    <section className="fo-panel" id="delegate-lanes">
      <header className="fo-panel-header">
        <h2>Delegate Mission Lanes</h2>
        <small>Batch-capable lane board with SLA risk shaping and lifecycle telemetry.</small>
      </header>

      <div className="fo-mission-metrics">
        <article className="fo-mission-metric">
          <strong>{missionStats.active}</strong>
          <small>active lanes</small>
        </article>
        <article className="fo-mission-metric">
          <strong>{missionStats.dueSoon}</strong>
          <small>due soon (&lt;72h)</small>
        </article>
        <article className="fo-mission-metric fo-mission-metric-warn">
          <strong>{missionStats.overdue}</strong>
          <small>overdue</small>
        </article>
        <article className="fo-mission-metric fo-mission-metric-critical">
          <strong>{missionStats.critical}</strong>
          <small>critical risk</small>
        </article>
      </div>

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
            {assign.isPending ? 'Assigning...' : 'Assign lane'}
          </button>
        </div>
      </div>

      <div className="fo-mission-toolbar">
        <input
          className="fo-input"
          value={searchFilter}
          onChange={event => setSearchFilter(event.target.value)}
          placeholder="Search title/assignee"
        />
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
        <select
          className="fo-input"
          value={priorityFilter}
          onChange={event =>
            setPriorityFilter(event.target.value as LanePriorityFilter)
          }
        >
          <option value="all">all priorities</option>
          <option value="low">low</option>
          <option value="normal">normal</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
        <select
          className="fo-input"
          value={riskFilter}
          onChange={event => setRiskFilter(event.target.value as LaneRiskFilter)}
        >
          <option value="all">all risk</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
          <option value="overdue">overdue</option>
          <option value="due-soon">due soon</option>
        </select>
      </div>

      <div className="fo-row">
        <input
          className="fo-input"
          value={assigneeFilter}
          onChange={event => setAssigneeFilter(event.target.value)}
          placeholder="Filter assignee"
        />
        <button className="fo-btn-secondary" type="button" onClick={selectAllVisible}>
          Select all visible
        </button>
        <button className="fo-btn-secondary" type="button" onClick={clearSelection}>
          Clear
        </button>
      </div>

      <div className="fo-mission-toolbar">
        <small>{selectedLaneIds.length} selected</small>
        <button
          className="fo-btn-secondary"
          type="button"
          disabled={batchCandidates.accepted.length === 0 || batchTransition.isPending}
          onClick={() =>
            batchTransition.mutate({
              laneIds: batchCandidates.accepted,
              next: 'accepted',
            })
          }
        >
          Batch accept ({batchCandidates.accepted.length})
        </button>
        <button
          className="fo-btn-secondary"
          type="button"
          disabled={batchCandidates.completed.length === 0 || batchTransition.isPending}
          onClick={() =>
            batchTransition.mutate({
              laneIds: batchCandidates.completed,
              next: 'completed',
            })
          }
        >
          Batch complete ({batchCandidates.completed.length})
        </button>
        <button
          className="fo-btn-secondary"
          type="button"
          disabled={batchCandidates.rejected.length === 0 || batchTransition.isPending}
          onClick={() =>
            batchTransition.mutate({
              laneIds: batchCandidates.rejected,
              next: 'rejected',
            })
          }
        >
          Batch reject ({batchCandidates.rejected.length})
        </button>
        <button
          className="fo-btn-secondary"
          type="button"
          disabled={batchCandidates.assigned.length === 0 || batchTransition.isPending}
          onClick={() =>
            batchTransition.mutate({
              laneIds: batchCandidates.assigned,
              next: 'assigned',
            })
          }
        >
          Batch reopen ({batchCandidates.assigned.length})
        </button>
      </div>

      <div className="fo-delegate-grid">
        <div className="fo-mission-board-list">
          {visibleLanes.length === 0 ? <small>No lanes match current filters.</small> : null}
          {visibleLanes.map(({ lane, risk }) => (
            <article
              key={lane.id}
              className={`fo-card fo-lane-card fo-lane-${lane.status} ${
                selectedLaneId === lane.id ? 'fo-lane-selected' : ''
              } ${risk.overdue ? 'fo-lane-overdue' : ''}`}
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
                <label className="fo-row">
                  <input
                    type="checkbox"
                    checked={selectedLaneIds.includes(lane.id)}
                    onChange={event => {
                      event.stopPropagation();
                      toggleSelectedLane(lane.id);
                    }}
                    onClick={event => event.stopPropagation()}
                  />
                  <strong>{lane.title}</strong>
                </label>
                <small className={`fo-lane-status fo-lane-status-${lane.status}`}>
                  {lane.status}
                </small>
              </div>

              <div className="fo-space-between">
                <small>
                  {lane.assignedBy} -&gt; {lane.assignee}
                </small>
                <small className={`fo-risk-badge fo-risk-badge-${risk.tier}`}>{risk.tier}</small>
              </div>

              <small>
                {lane.priority} priority · {dueLabel(lane.dueAtMs, nowMs)}
              </small>
              <small>updated: {formatDateTime(lane.updatedAtMs)}</small>

              <div className="fo-row">
                {lane.status === 'assigned' ? (
                  <>
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        transition.mutate({
                          laneId: lane.id,
                          next: 'accepted',
                          source: 'single',
                        });
                      }}
                      disabled={transition.isPending}
                    >
                      Accept
                    </button>
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        transition.mutate({
                          laneId: lane.id,
                          next: 'rejected',
                          source: 'single',
                        });
                      }}
                      disabled={transition.isPending}
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
                        transition.mutate({
                          laneId: lane.id,
                          next: 'completed',
                          source: 'single',
                        });
                      }}
                      disabled={transition.isPending}
                    >
                      Complete
                    </button>
                    <button
                      className="fo-btn-secondary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        transition.mutate({
                          laneId: lane.id,
                          next: 'rejected',
                          source: 'single',
                        });
                      }}
                      disabled={transition.isPending}
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
                      transition.mutate({
                        laneId: lane.id,
                        next: 'assigned',
                        source: 'single',
                      });
                    }}
                    disabled={transition.isPending}
                  >
                    Reopen
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <section className="fo-card fo-lane-detail fo-mission-board-detail">
          {selectedLane && selectedLaneRisk ? (
            <>
              <div className="fo-space-between">
                <strong>{selectedLane.title}</strong>
                <small className={`fo-risk-badge fo-risk-badge-${selectedLaneRisk.tier}`}>
                  {selectedLaneRisk.tier} risk
                </small>
              </div>
              <small>
                {selectedLane.assignedBy} -&gt; {selectedLane.assignee}
              </small>
              <small>
                {selectedLane.priority} priority · {dueLabel(selectedLane.dueAtMs, nowMs)}
              </small>
              <small>created: {formatDateTime(selectedLane.createdAtMs)}</small>
              <small>accepted: {formatDateTime(selectedLane.acceptedAtMs)}</small>
              <small>completed: {formatDateTime(selectedLane.completedAtMs)}</small>
              <small>rejected: {formatDateTime(selectedLane.rejectedAtMs)}</small>

              <div className="fo-row">
                {(['accepted', 'completed', 'rejected', 'assigned'] as const).map(next => (
                  <button
                    key={next}
                    className="fo-btn-secondary"
                    type="button"
                    disabled={
                      !canTransition(selectedLane.status, next) || transition.isPending
                    }
                    onClick={() =>
                      transition.mutate({
                        laneId: selectedLane.id,
                        next,
                        source: 'single',
                      })
                    }
                  >
                    {transitionLabel(next)}
                  </button>
                ))}
              </div>

              <div className="fo-stack">
                <strong>Lane timeline</strong>
                {laneEvents.isLoading ? <small>Loading lane timeline...</small> : null}
                <div className="fo-log-list">
                  {(laneEvents.data || []).map(event => (
                    <article className="fo-log" key={event.id}>
                      <div className="fo-space-between">
                        <strong className={`fo-event-badge fo-event-badge-${event.type}`}>
                          {event.type}
                        </strong>
                        <small>{formatDateTime(event.createdAtMs)}</small>
                      </div>
                      <small>{event.actorId}</small>
                      <small>{event.message || '-'}</small>
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
                  placeholder="Add mission note (Ctrl+Enter to submit)"
                  onKeyDown={event => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      if (!comment.trim() || addComment.isPending) {
                        return;
                      }
                      addComment.mutate(selectedLane.id);
                    }
                  }}
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
