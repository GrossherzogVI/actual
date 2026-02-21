// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

export type CategoryTemplate = {
  id: string;
  name: string;
  description: string;
  language: string;
  category_count: number;
};

export type CategoryMapEntry = {
  external_name: string;
  internal_category_id: string | null;
  suggested_category_id?: string;
  confidence?: number;
};

export type CategoriesSetupHandlers = {
  'categories-setup-german-tree': typeof categoriesSetupGermanTree;
  'categories-setup-templates': typeof categoriesSetupTemplates;
  'categories-setup-map': typeof categoriesSetupMap;
};

export const app = createApp<CategoriesSetupHandlers>();

app.method('categories-setup-german-tree', categoriesSetupGermanTree);
app.method('categories-setup-templates', categoriesSetupTemplates);
app.method('categories-setup-map', categoriesSetupMap);

async function categoriesSetupGermanTree(args?: {
  mergeExisting?: boolean;
}): Promise<
  { created: number; skipped: number; total: number } | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/categories-setup/german-tree',
      args || {},
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { created: number; skipped: number; total: number };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function categoriesSetupTemplates(): Promise<
  CategoryTemplate[] | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const res = await get(
      getServer().BASE_SERVER + '/categories-setup/templates',
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

async function categoriesSetupMap(args: {
  mappings: CategoryMapEntry[];
}): Promise<{ mapped: number; created: number } | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/categories-setup/map',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as { mapped: number; created: number };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}
