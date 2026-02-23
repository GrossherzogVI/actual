// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import {
  createGatewayEnvelope,
  gatewayGet,
  gatewayPost,
} from '../financeos-gateway';

type HandlerError = { error: string };

export type ScenarioHandlers = {
  'scenario-list-branches': typeof scenarioListBranches;
  'scenario-create-branch': typeof scenarioCreateBranch;
  'scenario-apply-mutation': typeof scenarioApplyMutation;
  'scenario-compare-outcomes': typeof scenarioCompareOutcomes;
  'scenario-adopt-branch': typeof scenarioAdoptBranch;
};

export const app = createApp<ScenarioHandlers>();

app.method('scenario-list-branches', scenarioListBranches);
app.method('scenario-create-branch', scenarioCreateBranch);
app.method('scenario-apply-mutation', scenarioApplyMutation);
app.method('scenario-compare-outcomes', scenarioCompareOutcomes);
app.method('scenario-adopt-branch', scenarioAdoptBranch);

function readError(err: unknown, fallback = 'unknown') {
  return (
    (err as { reason?: string; message?: string })?.reason ||
    (err as { reason?: string; message?: string })?.message ||
    fallback
  );
}

async function scenarioListBranches(): Promise<Array<Record<string, unknown>> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayGet<Array<Record<string, unknown>>>('/scenario/v1/branches', userToken);
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function scenarioCreateBranch(args: {
  name: string;
  baseBranchId?: string;
  notes?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/scenario/v1/create-branch',
      {
        envelope: createGatewayEnvelope('scenario-create-branch'),
        name: args.name,
        baseBranchId: args.baseBranchId,
        notes: args.notes,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function scenarioApplyMutation(args: {
  branchId?: string;
  mutationKind?: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/scenario/v1/apply-mutation',
      {
        envelope: createGatewayEnvelope('scenario-apply-mutation'),
        branchId: args.branchId ?? '',
        mutationKind: args.mutationKind ?? '',
        payload: args.payload,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function scenarioCompareOutcomes(args: {
  branchId?: string;
  againstBranchId?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/scenario/v1/compare-outcomes',
      {
        branchId: args.branchId ?? '',
        againstBranchId: args.againstBranchId,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function scenarioAdoptBranch(args: {
  branchId?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/scenario/v1/adopt-branch',
      {
        envelope: createGatewayEnvelope('scenario-adopt-branch'),
        branchId: args.branchId ?? '',
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}
