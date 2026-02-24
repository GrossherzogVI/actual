// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

type HandlerError = { error: string };

export type DelegateHandlers = {
  'delegate-list-lanes': typeof delegateListLanes;
  'delegate-assign-lane': typeof delegateAssignLane;
  'delegate-accept-lane': typeof delegateAcceptLane;
  'delegate-complete-lane': typeof delegateCompleteLane;
  'delegate-reject-lane': typeof delegateRejectLane;
};

export const app = createApp<DelegateHandlers>();

app.method('delegate-list-lanes', delegateListLanes);
app.method('delegate-assign-lane', delegateAssignLane);
app.method('delegate-accept-lane', delegateAcceptLane);
app.method('delegate-complete-lane', delegateCompleteLane);
app.method('delegate-reject-lane', delegateRejectLane);

function readError(err: unknown, fallback = 'unknown') {
  return (
    (err as { reason?: string; message?: string })?.reason ||
    (err as { reason?: string; message?: string })?.message ||
    fallback
  );
}

async function delegateListLanes(): Promise<
  Array<Record<string, unknown>> | HandlerError
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const res = await get(getServer().BASE_SERVER + '/ops/delegate/lanes', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
  return { error: 'no-response' };
}

async function delegateAssignLane(args: {
  title: string;
  assignee?: string;
  assignedBy?: string;
  payload?: Record<string, unknown>;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/delegate/lanes',
      {
        title: args.title,
        assignee: args.assignee || 'delegate',
        assignedBy: args.assignedBy ?? 'owner',
        payload: args.payload || {},
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}

async function delegateAcceptLane(args: {
  laneId?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/delegate/lanes/accept',
      { laneId: args.laneId ?? '' },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}

async function delegateCompleteLane(args: {
  laneId?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/delegate/lanes/complete',
      { laneId: args.laneId ?? '' },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}

async function delegateRejectLane(args: {
  laneId?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const result = await post(
      getServer().BASE_SERVER + '/ops/delegate/lanes/reject',
      { laneId: args.laneId ?? '' },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}
