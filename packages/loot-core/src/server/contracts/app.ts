// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { del, get, patch, post } from '../post';
import { getServer } from '../server-config';

export type ContractEntity = {
  id: string;
  file_id: string;
  name: string;
  provider: string | null;
  type:
    | 'insurance'
    | 'rent'
    | 'utility'
    | 'subscription'
    | 'tax'
    | 'loan'
    | 'other'
    | null;
  category_id: string | null;
  amount: number | null;
  frequency: string;
  start_date: string | null;
  end_date: string | null;
  cancellation_period_days: number | null;
  cancellation_deadline: string | null;
  next_payment_date: string | null;
  schedule_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractHandlers = {
  'contract-list': typeof listContracts;
  'contract-get': typeof getContract;
  'contract-create': typeof createContract;
  'contract-update': typeof updateContract;
  'contract-delete': typeof deleteContract;
  'contract-discover': typeof discoverContracts;
};

export const app = createApp<ContractHandlers>();

app.method('contract-list', listContracts);
app.method('contract-get', getContract);
app.method('contract-create', createContract);
app.method('contract-update', updateContract);
app.method('contract-delete', deleteContract);
app.method('contract-discover', discoverContracts);

async function listContracts(args: {
  fileId: string;
  status?: string;
  expiringWithin?: number;
}): Promise<ContractEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams({ fileId: args.fileId });
  if (args.status) params.set('status', args.status);
  if (args.expiringWithin)
    params.set('expiringWithin', String(args.expiringWithin));

  try {
    const res = await get(
      getServer().BASE_SERVER + `/contracts?${params.toString()}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function getContract(args: {
  id: string;
}): Promise<ContractEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(
      getServer().BASE_SERVER + `/contracts/${args.id}`,
      { headers: { 'X-ACTUAL-TOKEN': userToken } },
    );
    if (res) {
      const parsed = JSON.parse(res);
      if (parsed.status === 'ok') return parsed.data;
      return { error: parsed.reason || 'unknown' };
    }
  } catch (err) {
    return { error: err.message || 'network-failure' };
  }
  return { error: 'no-response' };
}

async function createContract(data: {
  name: string;
  file_id: string;
  provider?: string;
  type?: string;
  category_id?: string;
  amount?: number;
  frequency?: string;
  start_date?: string;
  end_date?: string;
  cancellation_period_days?: number;
  schedule_id?: string;
  notes?: string;
}): Promise<ContractEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/contracts',
      data,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ContractEntity;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function updateContract(args: {
  id: string;
  data: Partial<
    Omit<ContractEntity, 'id' | 'file_id' | 'created_at' | 'updated_at'>
  >;
}): Promise<ContractEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await patch(
      getServer().BASE_SERVER + `/contracts/${args.id}`,
      args.data,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ContractEntity;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function deleteContract(args: {
  id: string;
}): Promise<{ deleted: boolean } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await del(
      getServer().BASE_SERVER + `/contracts/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { deleted: boolean };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function discoverContracts(args?: {
  fileId?: string;
}): Promise<{ message: string } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/contracts/discover',
      args || {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { message: string };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
