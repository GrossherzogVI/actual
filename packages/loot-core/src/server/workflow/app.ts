// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import {
  createGatewayEnvelope,
  gatewayGet,
  gatewayPost,
} from '../financeos-gateway';

type HandlerError = { error: string };

export type WorkflowMoneyPulse = {
  generatedAtMs: number;
  pendingReviews: number;
  urgentReviews: number;
  expiringContracts: number;
};

export type WorkflowHandlers = {
  'workflow-money-pulse': typeof workflowMoneyPulse;
  'workflow-command-runs': typeof workflowCommandRuns;
  'workflow-resolve-next-action': typeof workflowResolveNextAction;
  'workflow-playbook-list': typeof workflowPlaybookList;
  'workflow-playbook-create': typeof workflowPlaybookCreate;
  'workflow-run-playbook': typeof workflowRunPlaybook;
  'workflow-run-close-routine': typeof workflowRunCloseRoutine;
  'workflow-apply-batch-policy': typeof workflowApplyBatchPolicy;
  'workflow-execute-chain': typeof workflowExecuteChain;
};

export const app = createApp<WorkflowHandlers>();

app.method('workflow-money-pulse', workflowMoneyPulse);
app.method('workflow-command-runs', workflowCommandRuns);
app.method('workflow-resolve-next-action', workflowResolveNextAction);
app.method('workflow-playbook-list', workflowPlaybookList);
app.method('workflow-playbook-create', workflowPlaybookCreate);
app.method('workflow-run-playbook', workflowRunPlaybook);
app.method('workflow-run-close-routine', workflowRunCloseRoutine);
app.method('workflow-apply-batch-policy', workflowApplyBatchPolicy);
app.method('workflow-execute-chain', workflowExecuteChain);

function readError(err: unknown, fallback = 'unknown') {
  return (
    (err as { reason?: string; message?: string })?.reason ||
    (err as { reason?: string; message?: string })?.message ||
    fallback
  );
}

async function workflowMoneyPulse(): Promise<WorkflowMoneyPulse | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayGet<WorkflowMoneyPulse>('/workflow/v1/money-pulse', userToken);
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function workflowCommandRuns(args: {
  limit?: number;
  actorId?: string;
  sourceSurface?: string;
  dryRun?: boolean;
  hasErrors?: boolean;
}): Promise<Array<Record<string, unknown>> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const limit = Math.max(1, Math.min(Number(args.limit ?? 20), 200));
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (args.actorId) {
      params.set('actorId', String(args.actorId));
    }
    if (args.sourceSurface) {
      params.set('sourceSurface', String(args.sourceSurface));
    }
    if (typeof args.dryRun === 'boolean') {
      params.set('dryRun', String(args.dryRun));
    }
    if (typeof args.hasErrors === 'boolean') {
      params.set('hasErrors', String(args.hasErrors));
    }
    return await gatewayGet<Array<Record<string, unknown>>>(
      `/workflow/v1/command-runs?${params.toString()}`,
      userToken,
    );
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function workflowResolveNextAction(): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/workflow/v1/resolve-next-action',
      { envelope: createGatewayEnvelope('resolve-next-action') },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function workflowPlaybookList(): Promise<Array<Record<string, unknown>> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayGet<Array<Record<string, unknown>>>('/workflow/v1/playbooks', userToken);
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function workflowPlaybookCreate(args: {
  name: string;
  description?: string;
  commands: Array<Record<string, unknown>>;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/workflow/v1/playbooks',
      {
        name: args.name,
        description: args.description ?? '',
        commands: args.commands,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function workflowRunPlaybook(args: {
  id: string;
  dryRun?: boolean;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/workflow/v1/run-playbook',
      {
        envelope: createGatewayEnvelope('run-playbook'),
        playbookId: args.id,
        dryRun: args.dryRun ?? true,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function workflowRunCloseRoutine(args: {
  period: 'weekly' | 'monthly';
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/workflow/v1/run-close-routine',
      {
        envelope: createGatewayEnvelope('run-close-routine'),
        period: args.period,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function workflowApplyBatchPolicy(args: {
  ids: string[];
  status: 'accepted' | 'rejected' | 'dismissed' | 'snoozed';
  resolvedAction?: string;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/workflow/v1/apply-batch-policy',
      {
        envelope: createGatewayEnvelope('apply-batch-policy'),
        ids: args.ids,
        status: args.status,
        resolvedAction: args.resolvedAction ?? 'batch-policy',
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function workflowExecuteChain(args: {
  chain: string;
  assignee?: string;
  dryRun?: boolean;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/workflow/v1/execute-chain',
      {
        envelope: createGatewayEnvelope('execute-chain'),
        chain: args.chain,
        assignee: args.assignee,
        dryRun: args.dryRun ?? false,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}
