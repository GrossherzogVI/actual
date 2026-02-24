import { useMemo, useState } from 'react';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { Category } from '../../core/types/finance';

type CategoryTreeProps = {
  categories: Category[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  search: string;
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

export function CategoryTree({ categories, selectedId, onSelect, search }: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const tree = useMemo(() => buildTree(categories), [categories]);

  // Filter tree by search term. If searching, force-expand groups that have matches.
  const { filteredTree, matchingGroupIds } = useMemo(() => {
    if (!search.trim()) {
      return { filteredTree: tree, matchingGroupIds: new Set<string>() };
    }

    const q = search.toLowerCase();
    const matching = new Set<string>();
    const filtered: CategoryGroup[] = [];

    for (const { group, children } of tree) {
      const groupMatches = group.name.toLowerCase().includes(q);
      const matchingChildren = children.filter(c => c.name.toLowerCase().includes(q));

      if (groupMatches || matchingChildren.length > 0) {
        filtered.push({
          group,
          children: matchingChildren.length > 0 ? matchingChildren : children,
        });
        matching.add(group.id);
      }
    }

    return { filteredTree: filtered, matchingGroupIds: matching };
  }, [tree, search]);

  function toggleGroup(groupId: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function isExpanded(groupId: string): boolean {
    // Force-expand when searching
    if (search.trim() && matchingGroupIds.has(groupId)) return true;
    return expanded.has(groupId);
  }

  if (filteredTree.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-[var(--fo-muted)]">
          {search.trim()
            ? 'Keine Kategorien gefunden.'
            : 'Noch keine Kategorien vorhanden.'}
        </p>
      </div>
    );
  }

  return (
    <div className="fo-stack" style={{ gap: 4 }}>
      {filteredTree.map(({ group, children }) => {
        const open = isExpanded(group.id);
        const isGroupSelected = selectedId === group.id;
        const Chevron = open ? ChevronDown : ChevronRight;

        return (
          <div key={group.id}>
            {/* L1 group header */}
            <div className="fo-row" style={{ gap: 0 }}>
              {/* Expand toggle */}
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--fo-muted)',
                }}
                onClick={() => toggleGroup(group.id)}
                aria-label={open ? 'Einklappen' : 'Ausklappen'}
              >
                <Chevron size={14} />
              </button>

              {/* Group row (clickable to select) */}
              <button
                type="button"
                className={`fo-row w-full text-left py-1.5 px-2 rounded-md transition-colors ${
                  isGroupSelected
                    ? 'bg-[rgba(255,255,255,0.08)] text-[var(--fo-text)]'
                    : 'hover:bg-[rgba(255,255,255,0.03)] text-[var(--fo-text)]'
                }`}
                style={{ border: 'none', background: isGroupSelected ? 'rgba(255,255,255,0.08)' : 'transparent', cursor: 'pointer' }}
                onClick={() => onSelect(isGroupSelected ? undefined : group.id)}
              >
                {group.color && (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                {group.icon && (
                  <span style={{ fontSize: 14, lineHeight: 1 }}>{group.icon}</span>
                )}
                <span className="text-sm font-medium flex-1">{group.name}</span>
                <span className="text-xs text-[var(--fo-muted)]">
                  {children.length}
                </span>
              </button>
            </div>

            {/* L2 children */}
            <AnimatePresence initial={false}>
              {open && children.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="ml-7 mt-0.5" style={{ display: 'grid', gap: 1 }}>
                    {children.map(child => {
                      const isChildSelected = selectedId === child.id;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={`fo-row text-left py-1.5 px-2 rounded-md text-sm transition-colors ${
                            isChildSelected
                              ? 'bg-[rgba(255,255,255,0.08)] text-[var(--fo-text)]'
                              : 'text-[var(--fo-muted)] hover:text-[var(--fo-text)] hover:bg-[rgba(255,255,255,0.03)]'
                          }`}
                          style={{ border: 'none', background: isChildSelected ? 'rgba(255,255,255,0.08)' : 'transparent', cursor: 'pointer' }}
                          onClick={() => onSelect(isChildSelected ? undefined : child.id)}
                        >
                          {child.color && (
                            <span
                              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: child.color }}
                            />
                          )}
                          <span className="flex-1">{child.name}</span>
                          {child.is_income && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded"
                              style={{
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#34d399',
                                fontSize: 10,
                                fontWeight: 500,
                              }}
                            >
                              Einnahme
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
