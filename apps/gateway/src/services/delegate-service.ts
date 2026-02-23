import type { GatewayQueue } from '../queue/types';
import type { GatewayRepository } from '../repositories/types';
import type { DelegateLane, DelegateLaneEvent, OpsActivityEvent } from '../types';

import {
  DELEGATE_ALLOWED_TRANSITIONS,
  nanoid,
  queueJob,
  toDelegateLaneEventActivity,
} from './helpers';

export type DelegateDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
};

export function createDelegateService(
  repository: GatewayRepository,
  queue: GatewayQueue,
  deps: DelegateDeps,
) {
  async function listDelegateLanes(input?: {
    limit?: number;
    status?: DelegateLane['status'];
    assignee?: string;
    assignedBy?: string;
    priority?: DelegateLane['priority'];
  }): Promise<DelegateLane[]> {
    const limit = Math.max(1, Math.min(input?.limit ?? 50, 200));
    return repository.listDelegateLanes(limit, {
      status: input?.status,
      assignee: input?.assignee,
      assignedBy: input?.assignedBy,
      priority: input?.priority,
    });
  }

  async function listDelegateLaneEvents(input: {
    laneId: string;
    limit?: number;
  }): Promise<DelegateLaneEvent[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    return repository.listDelegateLaneEvents(input.laneId, limit);
  }

  async function assignDelegateLane(input: {
    title: string;
    assignee: string;
    assignedBy: string;
    payload: Record<string, unknown>;
    priority?: DelegateLane['priority'];
    dueAtMs?: number;
    actorId?: string;
  }): Promise<DelegateLane> {
    const now = Date.now();
    const lane: DelegateLane = {
      id: nanoid(),
      title: input.title,
      priority: input.priority || 'normal',
      status: 'assigned',
      assignee: input.assignee,
      assignedBy: input.assignedBy,
      payload: input.payload,
      createdAtMs: now,
      updatedAtMs: now,
      dueAtMs: input.dueAtMs,
    };

    await repository.createDelegateLane(lane);
    const laneEvent = await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: lane.id,
      type: 'assigned',
      actorId: input.actorId || input.assignedBy,
      message: 'Lane assigned.',
      payload: {
        title: lane.title,
        assignee: lane.assignee,
        priority: lane.priority,
        dueAtMs: lane.dueAtMs,
      },
      createdAtMs: now,
    });
    await queue.enqueue(
      queueJob('delegate.lane.assigned', {
        laneId: lane.id,
        assignee: lane.assignee,
        priority: lane.priority,
      }),
    );

    await deps.appendOpsActivityEvent(
      toDelegateLaneEventActivity(lane, laneEvent),
    );

    return lane;
  }

  async function transitionDelegateLane(input: {
    laneId: string;
    status: DelegateLane['status'];
    actorId: string;
    message?: string;
  }): Promise<
    | { ok: true; lane: DelegateLane }
    | { ok: false; error: 'lane-not-found' | 'invalid-lane-transition' }
  > {
    const lane = await repository.getDelegateLaneById(input.laneId);
    if (!lane) return { ok: false, error: 'lane-not-found' };

    if (lane.status !== input.status) {
      const allowed = DELEGATE_ALLOWED_TRANSITIONS[lane.status];
      if (!allowed.includes(input.status)) {
        return { ok: false, error: 'invalid-lane-transition' };
      }
    }

    const now = Date.now();
    const updated: DelegateLane = {
      ...lane,
      status: input.status,
      updatedAtMs: now,
      acceptedAtMs: input.status === 'accepted' ? now : lane.acceptedAtMs,
      completedAtMs: input.status === 'completed' ? now : lane.completedAtMs,
      rejectedAtMs: input.status === 'rejected' ? now : lane.rejectedAtMs,
    };

    await repository.updateDelegateLane(updated);
    const laneEvent = await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: input.laneId,
      type:
        input.status === 'assigned' && lane.status !== 'assigned'
          ? 'reopened'
          : input.status,
      actorId: input.actorId,
      message: input.message,
      payload: {
        fromStatus: lane.status,
        toStatus: input.status,
      },
      createdAtMs: now,
    });
    await queue.enqueue(
      queueJob('delegate.lane.transitioned', {
        laneId: input.laneId,
        status: input.status,
        actorId: input.actorId,
      }),
    );

    await deps.appendOpsActivityEvent(
      toDelegateLaneEventActivity(updated, laneEvent),
    );

    return { ok: true, lane: updated };
  }

  async function commentDelegateLane(input: {
    laneId: string;
    actorId: string;
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<DelegateLaneEvent | null> {
    const lane = await repository.getDelegateLaneById(input.laneId);
    if (!lane) return null;

    const now = Date.now();
    const updatedLane: DelegateLane = {
      ...lane,
      updatedAtMs: now,
    };
    await repository.updateDelegateLane(updatedLane);

    const event = await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: input.laneId,
      type: 'comment',
      actorId: input.actorId,
      message: input.message,
      payload: input.payload,
      createdAtMs: now,
    });

    await queue.enqueue(
      queueJob('delegate.lane.commented', {
        laneId: input.laneId,
        actorId: input.actorId,
      }),
    );

    await deps.appendOpsActivityEvent(
      toDelegateLaneEventActivity(updatedLane, event),
    );

    return event;
  }

  return {
    listDelegateLanes,
    listDelegateLaneEvents,
    assignDelegateLane,
    transitionDelegateLane,
    commentDelegateLane,
  };
}
