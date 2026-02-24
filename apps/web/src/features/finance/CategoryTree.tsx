import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';

import { listCategories } from '../../core/api/finance-api';
import type { Category } from '../../core/types/finance';

type CategoryTreeProps = {
  selectedCategoryId?: string;
  onSelectCategory: (id: string | undefined) => void;
};

type CategoryGroup = {
  group: Category;
  children: Category[];
};

function buildTree(categories: Category[]): CategoryGroup[] {
  const groups: CategoryGroup[] = [];
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

  for (const group of groups) {
    group.children = (childMap.get(group.group.id) ?? []).sort(
      (a, b) => a.sort_order - b.sort_order,
    );
  }

  return groups.sort((a, b) => a.group.sort_order - b.group.sort_order);
}

export function CategoryTree({
  selectedCategoryId,
  onSelectCategory,
}: CategoryTreeProps) {
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(
    () => buildTree(categories ?? []),
    [categories],
  );

  function toggleGroup(groupId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  if (isLoading) {
    return (
      <section className="fo-panel">
        <header className="fo-panel-header">
          <h2>Kategorien</h2>
        </header>
        <div className="fo-stack">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="h-8 rounded-md bg-[var(--fo-bg)] animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Kategorien</h2>
        <small>{(categories ?? []).length} Kategorien</small>
      </header>

      <button
        type="button"
        className={`fo-chip text-left ${!selectedCategoryId ? 'fo-chip-active' : ''}`}
        onClick={() => onSelectCategory(undefined)}
      >
        Alle
      </button>

      <div className="fo-stack" style={{ maxHeight: 400, overflow: 'auto' }}>
        {tree.map(({ group, children }) => {
          const isExpanded = expanded.has(group.id);
          const Chevron = isExpanded ? ChevronDown : ChevronRight;

          return (
            <div key={group.id}>
              <button
                type="button"
                className="fo-row w-full text-left py-1 px-1 rounded hover:bg-[rgba(255,255,255,0.03)]"
                onClick={() => toggleGroup(group.id)}
              >
                <Chevron size={14} className="text-[var(--fo-muted)]" />
                {group.color && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                <span className="text-sm font-medium">{group.name}</span>
                <small className="text-[var(--fo-muted)] ml-auto">
                  {children.length}
                </small>
              </button>

              {isExpanded && children.length > 0 && (
                <div className="ml-5 mt-1 fo-stack">
                  {children.map(child => (
                    <button
                      key={child.id}
                      type="button"
                      className={`text-left py-1 px-2 rounded text-sm hover:bg-[rgba(255,255,255,0.03)] ${
                        selectedCategoryId === child.id
                          ? 'bg-[rgba(255,255,255,0.06)] text-[var(--fo-text)]'
                          : 'text-[var(--fo-muted)]'
                      }`}
                      onClick={() => onSelectCategory(child.id)}
                    >
                      <div className="fo-row">
                        {child.color && (
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: child.color }}
                          />
                        )}
                        {child.name}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
