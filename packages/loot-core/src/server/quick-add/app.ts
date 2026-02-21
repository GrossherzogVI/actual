// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { del, get, patch, post } from '../post';
import { getServer } from '../server-config';

export type PresetEntity = {
  id: string;
  label: string;
  icon: string | null;
  amount: number | null;
  category_id: string | null;
  payee: string | null;
  account_id: string | null;
  sort_order: number;
  is_auto: number; // 0 or 1
  use_count: number;
  created_at: string;
};

export type FrecencyEntry = {
  category_id: string;
  use_count: number;
  last_used_at: string | null;
  score: number;
};

export type QuickAddHandlers = {
  'quick-add-presets-list': typeof presetsListFn;
  'quick-add-presets-create': typeof presetsCreateFn;
  'quick-add-presets-update': typeof presetsUpdateFn;
  'quick-add-presets-delete': typeof presetsDeleteFn;
  'quick-add-presets-reorder': typeof presetsReorderFn;
  'quick-add-frecency-list': typeof frecencyListFn;
  'quick-add-frecency-bump': typeof frecencyBumpFn;
};

export const app = createApp<QuickAddHandlers>();

app.method('quick-add-presets-list', presetsListFn);
app.method('quick-add-presets-create', presetsCreateFn);
app.method('quick-add-presets-update', presetsUpdateFn);
app.method('quick-add-presets-delete', presetsDeleteFn);
app.method('quick-add-presets-reorder', presetsReorderFn);
app.method('quick-add-frecency-list', frecencyListFn);
app.method('quick-add-frecency-bump', frecencyBumpFn);

async function presetsListFn(): Promise<PresetEntity[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/quick-add/presets', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });
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

async function presetsCreateFn(args: {
  label: string;
  icon?: string;
  amount?: number;
  category_id?: string;
  payee?: string;
  account_id?: string;
  sort_order?: number;
}): Promise<PresetEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/quick-add/presets',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as PresetEntity;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function presetsUpdateFn(args: {
  id: string;
  label?: string;
  icon?: string;
  amount?: number;
  category_id?: string;
  payee?: string;
  account_id?: string;
  sort_order?: number;
}): Promise<PresetEntity | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  const { id, ...fields } = args;

  try {
    const result = await patch(
      getServer().BASE_SERVER + `/quick-add/presets/${id}`,
      fields,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as PresetEntity;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function presetsDeleteFn(args: {
  id: string;
}): Promise<{ deleted: boolean } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await del(
      getServer().BASE_SERVER + `/quick-add/presets/${args.id}`,
      {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { deleted: boolean };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function presetsReorderFn(args: {
  order: Array<{ id: string; sort_order: number }>;
}): Promise<{ reordered: number } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/quick-add/presets/reorder',
      { order: args.order },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { reordered: number };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function frecencyListFn(): Promise<FrecencyEntry[] | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(getServer().BASE_SERVER + '/quick-add/frecency', {
      headers: { 'X-ACTUAL-TOKEN': userToken },
    });
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

async function frecencyBumpFn(args: {
  category_id: string;
}): Promise<FrecencyEntry | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/quick-add/frecency/bump',
      { category_id: args.category_id },
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as FrecencyEntry;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
