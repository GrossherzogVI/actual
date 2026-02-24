// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

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

async function policyGetEgress(): Promise<
  Record<string, unknown> | HandlerError
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return { error: 'not-logged-in' };
  }

  try {
    const res = await get(getServer().BASE_SERVER + '/ops/policy', {
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
    const result = await post(
      getServer().BASE_SERVER + '/ops/policy/update',
      {
        allowCloud: args.allowCloud ?? false,
        allowedProviders: args.allowedProviders ?? [],
        redactionMode: args.redactionMode ?? 'strict',
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
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
    const params = new URLSearchParams();
    params.set('limit', String(args?.limit ?? 50));
    const res = await get(
      getServer().BASE_SERVER + `/ops/policy/audit?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
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
    const result = await post(
      getServer().BASE_SERVER + '/ops/policy/audit',
      {
        eventType: args.eventType ?? 'manual-audit-event',
        provider: args.provider,
        payload: args.payload,
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as Record<string, unknown>;
  } catch (err) {
    return { error: readError(err) };
  }
}
