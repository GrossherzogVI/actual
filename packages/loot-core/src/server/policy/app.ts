// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import {
  createGatewayEnvelope,
  gatewayGet,
  gatewayPost,
} from '../financeos-gateway';

type HandlerError = { error: string };

export type PolicyHandlers = {
  'policy-get-egress': typeof policyGetEgress;
  'policy-set-egress': typeof policySetEgress;
  'policy-list-egress-audit': typeof policyListEgressAudit;
  'policy-record-egress-audit': typeof policyRecordEgressAudit;
};

export const app = createApp<PolicyHandlers>();

app.method('policy-get-egress', policyGetEgress);
app.method('policy-set-egress', policySetEgress);
app.method('policy-list-egress-audit', policyListEgressAudit);
app.method('policy-record-egress-audit', policyRecordEgressAudit);

function readError(err: unknown, fallback = 'unknown') {
  return (
    (err as { reason?: string; message?: string })?.reason ||
    (err as { reason?: string; message?: string })?.message ||
    fallback
  );
}

async function policyGetEgress(): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayGet<Record<string, unknown>>('/policy/v1/egress-policy', userToken);
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function policySetEgress(args: {
  allowCloud?: boolean;
  allowedProviders?: string[];
  redactionMode?: 'strict' | 'balanced' | 'off';
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/policy/v1/set-egress-policy',
      {
        envelope: createGatewayEnvelope('set-egress-policy'),
        policy: {
          allowCloud: args.allowCloud ?? false,
          allowedProviders: args.allowedProviders ?? [],
          redactionMode: args.redactionMode ?? 'strict',
        },
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}

async function policyListEgressAudit(args?: {
  limit?: number;
}): Promise<Array<Record<string, unknown>> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Array<Record<string, unknown>>>(
      '/policy/v1/list-egress-audit',
      {
        limit: args?.limit ?? 50,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err, 'network-failure') };
  }
}

async function policyRecordEgressAudit(args: {
  eventType?: string;
  provider?: string;
  payload?: Record<string, unknown>;
}): Promise<Record<string, unknown> | HandlerError> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    return await gatewayPost<Record<string, unknown>>(
      '/policy/v1/record-egress-audit',
      {
        envelope: createGatewayEnvelope('record-egress-audit'),
        eventType: args.eventType ?? 'manual-audit-event',
        provider: args.provider,
        payload: args.payload,
      },
      userToken,
    );
  } catch (err) {
    return { error: readError(err) };
  }
}
