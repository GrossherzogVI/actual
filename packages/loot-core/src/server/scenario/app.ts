// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

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

async function scenarioListBranches(): Promise<Array<Record<string, unknown>> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/scenario/branches', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });

    const parsed = JSON.parse(res);
    return parsed.data as Array<Record<string, unknown>>;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function scenarioCreateBranch(args: {
  name: string;
  base_date?: string;
  notes?: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/scenario/branches',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function scenarioApplyMutation(args: {
  branch_id: string;
  kind: string;
  payload: Record<string, unknown>;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/scenario/branches/${args.branch_id}/mutations`,
      { kind: args.kind, payload: args.payload },
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function scenarioCompareOutcomes(args: {
  branch_id: string;
  against_branch_id?: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams();
  if (args.against_branch_id) {
    params.set('against', args.against_branch_id);
  }

  try {
    const res = await get(
      getServer().BASE_SERVER + `/scenario/branches/${args.branch_id}/compare?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );

    const parsed = JSON.parse(res);
    return parsed.data as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function scenarioAdoptBranch(args: {
  branch_id: string;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/scenario/branches/${args.branch_id}/adopt`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
