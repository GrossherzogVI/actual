// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

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

async function scenarioListBranches(): Promise<
  Array<Record<string, unknown>> | HandlerError
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const res = await get(getServer().BASE_SERVER + '/ops/scenario/branches', {
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
    const result = await post(
      getServer().BASE_SERVER + '/ops/scenario/branches',
      {
        name: args.name,
        baseBranchId: args.baseBranchId,
        notes: args.notes,
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
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
    const result = await post(
      getServer().BASE_SERVER +
        `/ops/scenario/branches/${args.branchId ?? ''}/mutations`,
      {
        mutationKind: args.mutationKind ?? '',
        payload: args.payload,
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
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
    const result = await post(
      getServer().BASE_SERVER + '/ops/scenario/compare-outcomes',
      {
        branchId: args.branchId ?? '',
        againstBranchId: args.againstBranchId,
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
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
    const result = await post(
      getServer().BASE_SERVER +
        `/ops/scenario/branches/${args.branchId ?? ''}/adopt`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}
