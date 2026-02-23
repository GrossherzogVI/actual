// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

export type WorkflowMoneyPulse = {
  generated_at: string;
  pending_reviews: number;
  urgent_reviews: number;
  active_contracts: number;
  monthly_commitment: number;
  top_actions: Array<{
    id: string;
    title: string;
    route: string;
    urgency: 'high' | 'medium' | 'low';
  }>;
};

export type WorkflowHandlers = {
  'workflow-money-pulse': typeof workflowMoneyPulse;
  'workflow-resolve-next-action': typeof workflowResolveNextAction;
  'workflow-playbook-list': typeof workflowPlaybookList;
  'workflow-playbook-create': typeof workflowPlaybookCreate;
  'workflow-run-playbook': typeof workflowRunPlaybook;
  'workflow-run-close-routine': typeof workflowRunCloseRoutine;
  'workflow-apply-batch-policy': typeof workflowApplyBatchPolicy;
};

export const app = createApp<WorkflowHandlers>();

app.method('workflow-money-pulse', workflowMoneyPulse);
app.method('workflow-resolve-next-action', workflowResolveNextAction);
app.method('workflow-playbook-list', workflowPlaybookList);
app.method('workflow-playbook-create', workflowPlaybookCreate);
app.method('workflow-run-playbook', workflowRunPlaybook);
app.method('workflow-run-close-routine', workflowRunCloseRoutine);
app.method('workflow-apply-batch-policy', workflowApplyBatchPolicy);

async function workflowMoneyPulse(): Promise<WorkflowMoneyPulse | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/workflow/money-pulse', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });

    const parsed = JSON.parse(res);
    return parsed.data as WorkflowMoneyPulse;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function workflowResolveNextAction(): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/workflow/resolve-next-action',
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function workflowPlaybookList(): Promise<Array<Record<string, unknown>> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/workflow/playbooks', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });

    const parsed = JSON.parse(res);
    return parsed.data as Array<Record<string, unknown>>;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function workflowPlaybookCreate(args: {
  name: string;
  description?: string;
  commands: Array<Record<string, unknown>>;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/workflow/playbooks',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function workflowRunPlaybook(args: {
  id: string;
  dry_run?: boolean;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/workflow/playbooks/${args.id}/run`,
      { dry_run: args.dry_run ?? true },
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function workflowRunCloseRoutine(args: {
  period: 'weekly' | 'monthly';
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/workflow/run-close-routine',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function workflowApplyBatchPolicy(args: {
  ids: string[];
  status: 'accepted' | 'rejected' | 'dismissed' | 'snoozed';
  resolved_action?: string;
}): Promise<{ updated: number; status: string } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/workflow/apply-batch-policy',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as { updated: number; status: string };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
