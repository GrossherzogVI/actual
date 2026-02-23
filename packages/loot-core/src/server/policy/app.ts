// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, patch, post } from '../post';
import { getServer } from '../server-config';

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

async function policyGetEgress(): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/policy/egress-policy', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });
    const parsed = JSON.parse(res);
    return parsed.data as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function policySetEgress(args: {
  allow_cloud?: boolean;
  allowed_providers?: string[];
  redaction_mode?: 'strict' | 'balanced' | 'off';
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await patch(
      getServer().BASE_SERVER + '/policy/egress-policy',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function policyListEgressAudit(args?: {
  limit?: number;
}): Promise<Array<Record<string, unknown>> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams();
  if (args?.limit) params.set('limit', String(args.limit));

  try {
    const res = await get(
      getServer().BASE_SERVER + `/policy/egress-audit?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );

    const parsed = JSON.parse(res);
    return parsed.data as Array<Record<string, unknown>>;
  } catch (err) {
    return { error: err.reason || err.message || 'network-failure' };
  }
}

async function policyRecordEgressAudit(args: {
  event_type: string;
  provider?: string;
  payload?: Record<string, unknown>;
}): Promise<Record<string, unknown> | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/policy/record-egress',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );

    return result as Record<string, unknown>;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
