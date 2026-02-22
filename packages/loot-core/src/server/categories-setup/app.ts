// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import * as db from '../db';
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

type GermanTreeGroup = {
  name: string;
  color: string;
  icon: string;
  is_income: boolean;
  categories: string[];
};

async function categoriesSetupGermanTree(args?: {
  mergeExisting?: boolean;
}): Promise<
  { created: number; skipped: number; total: number } | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    // Fetch the tree structure from the server
    const result = await post(
      getServer().BASE_SERVER + '/categories-setup/german-tree',
      args || {},
      { 'X-ACTUAL-TOKEN': userToken },
    );

    const groups: GermanTreeGroup[] = (result as any).groups;
    if (!Array.isArray(groups) || groups.length === 0) {
      return { error: 'empty-tree' };
    }

    let created = 0;
    let skipped = 0;
    const total = groups.reduce(
      (sum, g) => sum + g.categories.length,
      groups.length,
    );

    for (const group of groups) {
      let groupId: string;
      try {
        groupId = await db.insertCategoryGroup({
          name: group.name,
          is_income: group.is_income ? 1 : 0,
        });
        created++;
      } catch {
        // Group already exists — find its ID if merging
        if (args?.mergeExisting) {
          const existing = await db.first<{ id: string }>(
            `SELECT id FROM category_groups WHERE UPPER(name) = ? AND tombstone = 0 LIMIT 1`,
            [group.name.toUpperCase()],
          );
          if (existing) {
            groupId = existing.id;
            skipped++;
          } else {
            skipped += 1 + group.categories.length;
            continue;
          }
        } else {
          skipped += 1 + group.categories.length;
          continue;
        }
      }

      for (const catName of group.categories) {
        try {
          await db.insertCategory({ name: catName, cat_group: groupId });
          created++;
        } catch {
          skipped++;
        }
      }
    }

    return { created, skipped, total };
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
