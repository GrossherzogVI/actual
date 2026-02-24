import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { FolderTree, Plus, Search, Tag } from 'lucide-react';
import { motion } from 'motion/react';

import { listCategories } from '../../core/api/finance-api';
import type { Category } from '../../core/types/finance';
import { CategoryForm } from './CategoryForm';
import { CategoryTree } from './CategoryTree';

export function CategoriesPage() {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | undefined>();

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  // Summary stats
  const stats = useMemo(() => {
    const all = categories ?? [];
    const l1Count = all.filter(c => !c.parent).length;
    const l2Count = all.filter(c => !!c.parent).length;
    const incomeCount = all.filter(c => c.is_income).length;
    return { l1Count, l2Count, incomeCount, total: all.length };
  }, [categories]);

  // Selected category details
  const selectedCategory = useMemo(() => {
    if (!selectedId || !categories) return undefined;
    return categories.find(c => c.id === selectedId);
  }, [selectedId, categories]);

  function openCreate() {
    setEditingCategory(undefined);
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setEditingCategory(cat);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingCategory(undefined);
  }

  // Loading state
  if (isLoading) {
    return (
      <motion.div
        className="p-5"
        style={{ display: 'grid', gap: 20 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <section className="fo-panel">
          <header className="fo-panel-header">
            <h2>Kategorien</h2>
          </header>
          <div className="fo-stack">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-10 rounded-md bg-[var(--fo-bg)] animate-pulse"
              />
            ))}
          </div>
        </section>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="p-5 h-full overflow-auto"
      style={{ display: 'grid', gap: 20, alignContent: 'start' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Summary bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <SummaryCard
          label="Hauptgruppen"
          value={String(stats.l1Count)}
          accent="var(--fo-info)"
        />
        <SummaryCard
          label="Unterkategorien"
          value={String(stats.l2Count)}
          accent="var(--fo-text)"
        />
        <SummaryCard
          label="Einnahmen"
          value={String(stats.incomeCount)}
          accent="#34d399"
        />
        <SummaryCard
          label="Gesamt"
          value={String(stats.total)}
          accent="var(--fo-muted)"
        />
      </div>

      {/* Main panel */}
      <section className="fo-panel">
        <header className="fo-panel-header">
          <div className="fo-space-between">
            <div className="fo-row" style={{ gap: 8 }}>
              <FolderTree size={16} className="text-[var(--fo-muted)]" />
              <h2>Kategorien</h2>
            </div>
            <button
              type="button"
              className="fo-btn fo-row"
              style={{ padding: '6px 12px', fontSize: 13, gap: 6 }}
              onClick={openCreate}
            >
              <Plus size={14} />
              Neue Kategorie
            </button>
          </div>
        </header>

        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fo-muted)]"
          />
          <input
            type="text"
            className="fo-input pl-8"
            placeholder="Kategorien durchsuchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Category tree */}
        <CategoryTree
          categories={categories ?? []}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={search}
        />

        {/* Selected category detail bar */}
        {selectedCategory && (
          <div
            className="fo-card"
            style={{
              borderLeft: selectedCategory.color
                ? `3px solid ${selectedCategory.color}`
                : '3px solid var(--fo-border)',
            }}
          >
            <div className="fo-space-between">
              <div className="fo-row" style={{ gap: 8 }}>
                {selectedCategory.icon && (
                  <span style={{ fontSize: 18 }}>{selectedCategory.icon}</span>
                )}
                <div>
                  <div className="text-sm font-medium">{selectedCategory.name}</div>
                  <div className="text-xs text-[var(--fo-muted)]">
                    {selectedCategory.parent ? 'Unterkategorie' : 'Hauptgruppe'}
                    {selectedCategory.is_income && (
                      <span
                        className="ml-2 px-1.5 py-0.5 rounded"
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
                  </div>
                </div>
              </div>
              <div className="fo-row" style={{ gap: 6 }}>
                <button
                  type="button"
                  className="fo-btn-secondary fo-row"
                  style={{ padding: '4px 10px', fontSize: 12, gap: 4 }}
                  onClick={() => openEdit(selectedCategory)}
                >
                  <Tag size={12} />
                  Bearbeiten
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Count footer */}
        {(categories ?? []).length > 0 && (
          <div className="text-xs text-[var(--fo-muted)] text-center">
            {stats.l1Count} Gruppen mit {stats.l2Count} Unterkategorien
          </div>
        )}
      </section>

      {/* Form slide-over */}
      <CategoryForm
        category={editingCategory}
        open={formOpen}
        onClose={closeForm}
      />
    </motion.div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="fo-metric-card">
      <span
        className="text-lg font-semibold tabular-nums"
        style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
      <span className="text-xs text-[var(--fo-muted)]">{label}</span>
    </div>
  );
}
