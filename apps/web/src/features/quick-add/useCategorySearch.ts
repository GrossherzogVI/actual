import { useMemo } from 'react';

import type { Category } from '../../core/types/finance';

type GroupedCategories = {
  group: Category;
  children: Category[];
};

function buildGroups(categories: Category[]): GroupedCategories[] {
  const groups: GroupedCategories[] = [];
  const childMap = new Map<string, Category[]>();

  for (const cat of categories) {
    if (!cat.parent) {
      groups.push({ group: cat, children: [] });
    } else {
      const list = childMap.get(cat.parent) ?? [];
      list.push(cat);
      childMap.set(cat.parent, list);
    }
  }

  for (const g of groups) {
    g.children = (childMap.get(g.group.id) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }

  return groups.sort((a, b) => a.group.sort_order - b.group.sort_order);
}

export function useCategorySearch(search: string, categories: Category[]) {
  return useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return {
        flat: categories,
        grouped: buildGroups(categories),
      };
    }

    // Score: prefix match > contains
    const scored = categories
      .map(cat => {
        const name = cat.name.toLowerCase();
        if (name.startsWith(query)) return { cat, score: 2 };
        if (name.includes(query)) return { cat, score: 1 };
        return { cat, score: 0 };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.cat.sort_order - b.cat.sort_order);

    const flat = scored.map(s => s.cat);

    return {
      flat,
      grouped: buildGroups(flat),
    };
  }, [search, categories]);
}
