// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

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

async function delegateListLanes(): Promise<Array<Record<string, unknown>> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/delegate/lanes', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });

    const parsed = JSON.parse(res);
    return parsed.data as Array<Record<string, unknown>>;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function delegateAssignLane(args: {
  title: string;
  assignee?: string;
  assigned_by?: string;
  payload?: Record<string, unknown>;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/delegate/assign-lane',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function delegateAcceptLane(args: {
  id: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/delegate/accept-lane/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function delegateCompleteLane(args: {
  id: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/delegate/complete-lane/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function delegateRejectLane(args: {
  id: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/delegate/reject-lane/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
