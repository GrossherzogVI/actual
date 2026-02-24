import { useMemo, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { deleteBudget } from '../../core/api/finance-api';
import type { BudgetEnvelopeData } from '../../core/types/finance';
import { BudgetAlertBanner } from './BudgetAlertBanner';
import { BudgetEnvelope } from './BudgetEnvelope';
import { BudgetForm } from './BudgetForm';
import { BudgetMonthNav } from './BudgetMonthNav';
import { BudgetOverviewBar } from './BudgetOverviewBar';
import { getCurrentMonth } from './budget-utils';
import { useBudgetData } from './useBudgetData';

export function BudgetPage() {
  const [month, setMonth] = useState(getCurrentMonth);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEnvelope, setEditingEnvelope] = useState<
    BudgetEnvelopeData | undefined
  >();

  const queryClient = useQueryClient();
  const { envelopes, summary, categories, isLoading } = useBudgetData(month);

  // IDs of categories that already have a budget (for the form's exclusion list)
  const existingBudgetIds = useMemo(
    () => envelopes.map(e => e.category),
    [envelopes],
  );

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', month] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary', month] });
    },
  });

  function openCreate() {
    setEditingEnvelope(undefined);
    setFormOpen(true);
  }

  function openEdit(envelope: BudgetEnvelopeData) {
    setEditingEnvelope(envelope);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingEnvelope(undefined);
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <motion.div
        className="p-5"
        style={{ display: 'grid', gap: 20 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="h-10 rounded-md bg-[var(--fo-bg)] animate-pulse"
          style={{ width: 260, margin: '0 auto' }}
        />
        <div className="h-28 rounded-md bg-[var(--fo-bg)] animate-pulse" />
        <section className="fo-panel">
          <header className="fo-panel-header">
            <h2>Budgets</h2>
          </header>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-36 rounded-md bg-[var(--fo-bg)] animate-pulse"
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
      {/* Month navigation */}
      <BudgetMonthNav month={month} onChange={setMonth} />

      {/* Alert banners */}
      <BudgetAlertBanner envelopes={envelopes} />

      {/* Overview bar */}
      <BudgetOverviewBar summary={summary} />

      {/* Envelopes panel */}
      <section className="fo-panel">
        <header className="fo-panel-header">
          <div className="fo-space-between">
            <h2>Budgets</h2>
            <button
              type="button"
              className="fo-btn fo-row"
              style={{ padding: '6px 12px', fontSize: 13, gap: 6 }}
              onClick={openCreate}
            >
              <Plus size={14} />
              Budget hinzufuegen
            </button>
          </div>
        </header>

        {envelopes.length === 0 ? (
          <EmptyState onAdd={openCreate} />
        ) : (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              <AnimatePresence mode="popLayout">
                {envelopes.map((envelope, i) => (
                  <motion.div
                    key={envelope.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15, delay: i * 0.03 }}
                  >
                    <BudgetEnvelope
                      envelope={envelope}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Count footer */}
            <div className="text-xs text-[var(--fo-muted)] text-center">
              {envelopes.length}{' '}
              {envelopes.length === 1 ? 'Budget' : 'Budgets'} in diesem Monat
            </div>
          </>
        )}
      </section>

      {/* Budget form slide-over */}
      {formOpen && (
        <BudgetForm
          month={month}
          categories={categories}
          existingBudgetIds={existingBudgetIds}
          editingBudget={editingEnvelope}
          onClose={closeForm}
        />
      )}
    </motion.div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="fo-card text-center py-12">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, type: 'spring' }}
        className="mb-3"
      >
        <Landmark size={32} className="mx-auto text-[var(--fo-muted)]" />
      </motion.div>
      <p className="text-sm text-[var(--fo-text)]">
        Noch keine Budgets fuer diesen Monat.
      </p>
      <p className="text-xs text-[var(--fo-muted)] mt-1">
        Lege Budgets an, um deine Ausgaben in Kategorien zu verfolgen.
      </p>
      <button
        type="button"
        className="fo-btn mt-4"
        style={{ fontSize: 13, padding: '7px 16px' }}
        onClick={onAdd}
      >
        Erstes Budget anlegen
      </button>
    </div>
  );
}
