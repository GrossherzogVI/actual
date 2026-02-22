// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { currentDay } from '../../shared/months';
import { createApp } from '../app';
import { del, get, patch, post } from '../post';
import { createSchedule } from '../schedules/app';
import { getServer } from '../server-config';

export type ContractEntity = {
  id: string;
  name: string;
  provider: string | null;
  type:
    | 'subscription'
    | 'insurance'
    | 'utility'
    | 'loan'
    | 'membership'
    | 'rent'
    | 'tax'
    | 'other';
  category_id: string | null;
  schedule_id: string | null;
  amount: number | null; // cents
  currency: string;
  interval:
    | 'weekly'
    | 'monthly'
    | 'quarterly'
    | 'semi-annual'
    | 'annual'
    | 'custom';
  custom_interval_days: number | null;
  payment_account_id: string | null;
  start_date: string | null;
  end_date: string | null;
  notice_period_months: number;
  auto_renewal: boolean;
  cancellation_deadline: string | null;
  status: 'active' | 'expiring' | 'cancelled' | 'paused' | 'discovered';
  notes: string | null;
  iban: string | null;
  counterparty: string | null;
  tags: string[];
  annual_cost: number | null;
  cost_per_day: number | null;
  health: 'green' | 'yellow' | 'red';
  price_history: unknown[];
  additional_events: unknown[];
  documents: unknown[];
  created_at: string;
  updated_at: string;
};

export type ContractSummary = {
  total_monthly: number;
  total_annual: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
};

export type ContractDeadlineEntry = {
  date: string;
  action: string;
  soft: string;
  hard: string;
  status: 'ok' | 'action_due' | 'soft_passed' | 'hard_passed';
};

export type ContractHandlers = {
  'contract-list': typeof listContracts;
  'contract-get': typeof getContract;
  'contract-create': typeof createContract;
  'contract-update': typeof updateContract;
  'contract-delete': typeof deleteContract;
  'contract-summary': typeof contractSummary;
  'contract-expiring': typeof contractExpiring;
  'contract-discover': typeof discoverContracts;
  'contract-bulk-import': typeof contractBulkImport;
  'contract-price-change': typeof contractPriceChange;
  'contract-deadlines': typeof contractDeadlines;
};

export const app = createApp<ContractHandlers>();

app.method('contract-list', listContracts);
app.method('contract-get', getContract);
app.method('contract-create', createContract);
app.method('contract-update', updateContract);
app.method('contract-delete', deleteContract);
app.method('contract-summary', contractSummary);
app.method('contract-expiring', contractExpiring);
app.method('contract-discover', discoverContracts);
app.method('contract-bulk-import', contractBulkImport);
app.method('contract-price-change', contractPriceChange);
app.method('contract-deadlines', contractDeadlines);

// Maps contract interval to Actual schedule frequency string
function intervalToFrequency(
  interval: string,
): 'weekly' | 'monthly' | 'yearly' {
  switch (interval) {
    case 'weekly':
      return 'weekly';
    case 'quarterly':
    case 'semi-annual':
    case 'monthly':
      return 'monthly';
    case 'annual':
      return 'yearly';
    default:
      return 'monthly';
  }
}

async function listContracts(args: {
  status?: string;
  type?: string;
  category?: string;
  search?: string;
}): Promise<ContractEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status);
  if (args.type) params.set('type', args.type);
  if (args.category) params.set('category', args.category);
  if (args.search) params.set('search', args.search);

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
  provider?: string;
  type?: string;
  category_id?: string;
  amount?: number;
  currency?: string;
  interval?: string;
  custom_interval_days?: number;
  payment_account_id?: string;
  start_date?: string;
  end_date?: string;
  notice_period_months?: number;
  auto_renewal?: boolean;
  status?: string;
  notes?: string;
  iban?: string;
  counterparty?: string;
  tags?: string[];
}): Promise<ContractEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  // Step 1: If payment info provided, create an Actual schedule first
  let scheduleId: string | null = null;
  if (data.amount && data.interval && data.interval !== 'custom') {
    try {
      scheduleId = await createSchedule({
        schedule: {
          name: data.name,
          posts_transaction: false,
        },
        conditions: [
          ...(data.payment_account_id
            ? [{ op: 'is', field: 'account', value: data.payment_account_id }]
            : []),
          { op: 'is', field: 'amount', value: data.amount },
          {
            op: 'isapprox',
            field: 'date',
            value: {
              frequency: intervalToFrequency(data.interval),
              start: data.start_date || currentDay(),
              interval: 1,
            },
          },
        ],
      });
    } catch (err) {
      return { error: err.message || 'schedule-create-failed' };
    }
  }

  // Step 2: Create contract on sync-server with schedule reference
  try {
    const result = await post(
      getServer().BASE_SERVER + '/contracts',
      { ...data, schedule_id: scheduleId },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ContractEntity;
  } catch (err) {
    // If contract creation fails and we created a schedule, we can't easily
    // roll back the schedule here (no delete access), but log the orphan risk.
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function updateContract(args: {
  id: string;
  data: Partial<
    Omit<ContractEntity, 'id' | 'created_at' | 'updated_at'>
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

async function contractSummary(): Promise<ContractSummary | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(
      getServer().BASE_SERVER + '/contracts/summary',
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

async function contractExpiring(args?: {
  withinDays?: number;
}): Promise<ContractEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams();
  if (args?.withinDays) params.set('withinDays', String(args.withinDays));

  try {
    const res = await get(
      getServer().BASE_SERVER + `/contracts/expiring?${params.toString()}`,
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

async function discoverContracts(args?: {
  lookbackDays?: number;
}): Promise<{ discovered: number; contracts: unknown[] } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/contracts/discover',
      args || {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { discovered: number; contracts: unknown[] };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function contractBulkImport(args: {
  contracts: unknown[];
  source?: string;
}): Promise<{ imported: number; skipped: number } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/contracts/bulk-import',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { imported: number; skipped: number };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function contractPriceChange(args: {
  id: string;
  oldAmount: number;
  newAmount: number;
  changeDate: string;
  reason?: string;
}): Promise<{ priceHistory: unknown } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + `/contracts/${args.id}/price-change`,
      {
        old_amount: args.oldAmount,
        new_amount: args.newAmount,
        change_date: args.changeDate,
        reason: args.reason,
      },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { priceHistory: unknown };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function contractDeadlines(args: {
  id: string;
  count?: number;
  bundesland?: string;
}): Promise<ContractDeadlineEntry[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const params = new URLSearchParams();
  if (args.count) params.set('count', String(args.count));
  if (args.bundesland) params.set('bundesland', args.bundesland);

  try {
    const res = await get(
      getServer().BASE_SERVER +
        `/contracts/${args.id}/deadlines?${params.toString()}`,
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
