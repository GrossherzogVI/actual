// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import {
  createGatewayEnvelope,
  gatewayGet,
  gatewayPost,
} from '../financeos-gateway';

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

async function delegateListLanes(): Promise<Array<Record<string, unknown>> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayGet<Array<Record<string, unknown>>>('/delegate/v1/lanes', userToken);
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
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
    return await gatewayPost<Record<string, unknown>>(
      '/delegate/v1/assign-lane',
      {
        envelope: createGatewayEnvelope('delegate-assign-lane'),
        title: args.title,
        assignee: args.assignee || 'delegate',
        assignedBy: args.assignedBy ?? 'owner',
        payload: args.payload || {},
      },
      userToken,
    );
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
    return await gatewayPost<Record<string, unknown>>(
      '/delegate/v1/accept-lane',
      {
        envelope: createGatewayEnvelope('delegate-accept-lane'),
        laneId: args.laneId ?? '',
      },
      userToken,
    );
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
    return await gatewayPost<Record<string, unknown>>(
      '/delegate/v1/complete-lane',
      {
        envelope: createGatewayEnvelope('delegate-complete-lane'),
        laneId: args.laneId ?? '',
      },
      userToken,
    );
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
    return await gatewayPost<Record<string, unknown>>(
      '/delegate/v1/reject-lane',
      {
        envelope: createGatewayEnvelope('delegate-reject-lane'),
        laneId: args.laneId ?? '',
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}
