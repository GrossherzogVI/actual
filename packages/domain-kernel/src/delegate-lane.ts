/** Delegate lane types for triage batch assignment */

export type DelegateLaneId = string;

export type DelegateLaneStatus =
  | 'open'
  | 'in-progress'
  | 'escalated'
  | 'resolved'
  | 'stale';

export type DelegatePriority = 'low' | 'medium' | 'high' | 'critical';

export type DelegateLane = {
  laneId: DelegateLaneId;
  title: string;
  status: DelegateLaneStatus;
  priority: DelegatePriority;
  assigneeId: string | null;
  itemIds: string[];
  createdAtMs: number;
  updatedAtMs: number;
  stalenessThresholdMs: number;
};

export type DelegateBatch = {
  batchId: string;
  lanes: DelegateLane[];
  policy: DelegateBatchPolicy;
  createdAtMs: number;
};

export type DelegateBatchPolicy = {
  maxLaneSize: number;
  autoEscalateAfterMs: number;
  requiresApproval: boolean;
};

export const DEFAULT_DELEGATE_POLICY: DelegateBatchPolicy = {
  maxLaneSize: 50,
  autoEscalateAfterMs: 48 * 60 * 60 * 1000, // 48h
  requiresApproval: false,
};

export function isLaneStale(lane: DelegateLane, nowMs = Date.now()): boolean {
  return (
    lane.status !== 'resolved' &&
    nowMs - lane.updatedAtMs > lane.stalenessThresholdMs
  );
}

export function computeLaneHealth(
  lane: DelegateLane,
  nowMs = Date.now(),
): 'resolved' | 'healthy' | 'at-risk' | 'stale' | 'escalated' {
  if (lane.status === 'resolved') return 'resolved';
  if (lane.status === 'escalated') return 'escalated';
  if (isLaneStale(lane, nowMs)) return 'stale';
  const age = nowMs - lane.updatedAtMs;
  if (age > lane.stalenessThresholdMs * 0.75) return 'at-risk';
  return 'healthy';
}
