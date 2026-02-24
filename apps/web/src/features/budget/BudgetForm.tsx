import { useCallback, useEffect, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { upsertBudget } from '../../core/api/finance-api';
import type { BudgetEnvelopeData, Category } from '../../core/types/finance';

type BudgetFormProps = {
  month: string;
  categories: Category[];
  /** IDs of categories that already have a budget this month */
  existingBudgetIds: string[];
  /** When set, the form is in edit mode */
  editingBudget?: BudgetEnvelopeData;
  onClose: () => void;
};

type FormData = {
  categoryId: string;
  amount: string;
  rollover: boolean;
};

const EMPTY_FORM: FormData = {
  categoryId: '',
  amount: '',
  rollover: false,
};

function envelopeToForm(envelope: BudgetEnvelopeData): FormData {
  return {
    categoryId: envelope.category,
    amount: String(envelope.amount).replace('.', ','),
    rollover: envelope.rollover,
  };
}

export function BudgetForm({
  month,
  categories,
  existingBudgetIds,
  editingBudget,
  onClose,
}: BudgetFormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!editingBudget;

  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  useEffect(() => {
    setForm(editingBudget ? envelopeToForm(editingBudget) : EMPTY_FORM);
  }, [editingBudget]);

  const set = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) =>
      setForm(prev => ({ ...prev, [key]: value })),
    [],
  );

  const saveMutation = useMutation({
    mutationFn: ({
      category,
      amount,
      rollover,
    }: {
      category: string;
      amount: number;
      rollover: boolean;
    }) => upsertBudget(category, month, amount, rollover),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', month] });
      queryClient.invalidateQueries({ queryKey: ['budget-summary', month] });
      onClose();
    },
  });

  // Expense categories only, excluding already-budgeted ones (in create mode)
  const availableCategories = categories.filter(cat => {
    if (cat.is_income) return false;
    if (isEdit) return true; // in edit mode, show all (including the current one)
    return !existingBudgetIds.includes(cat.id);
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedAmount = parseFloat(form.amount.replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (!form.categoryId) return;

    saveMutation.mutate({
      category: form.categoryId,
      amount: parsedAmount,
      rollover: form.rollover,
    });
  }

  const isSaving = saveMutation.isPending;

  return (
    <AnimatePresence>
      {(true as boolean) && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Slide-over */}
          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
            style={{
              width: 'min(460px, 96vw)',
              background: 'var(--fo-bg-2)',
              borderLeft: '1px solid var(--fo-border)',
              boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div
              className="fo-space-between"
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--fo-border)',
              }}
            >
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                {isEdit ? 'Budget bearbeiten' : 'Neues Budget'}
              </h2>
              <button
                type="button"
                className="fo-btn-secondary"
                style={{ padding: 6, borderRadius: 6 }}
                onClick={onClose}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form body */}
            <form
              className="flex-1 overflow-auto"
              style={{
                padding: 20,
                display: 'grid',
                gap: 16,
                alignContent: 'start',
              }}
              onSubmit={handleSubmit}
            >
              {/* Category dropdown */}
              <FieldGroup label="Kategorie">
                <select
                  className="fo-input"
                  value={form.categoryId}
                  onChange={e => set('categoryId', e.target.value)}
                  required
                  disabled={isEdit}
                >
                  <option value="">Kategorie wählen...</option>
                  {availableCategories.length === 0 && !isEdit ? (
                    <option disabled>
                      Alle Kategorien haben bereits ein Budget
                    </option>
                  ) : (
                    availableCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon ? `${cat.icon} ` : ''}
                        {cat.name}
                      </option>
                    ))
                  )}
                </select>
                {isEdit && (
                  <span className="text-xs text-[var(--fo-muted)]">
                    Kategorie kann nicht geaendert werden — neues Budget
                    anlegen.
                  </span>
                )}
              </FieldGroup>

              {/* Amount */}
              <FieldGroup label="Betrag (EUR)">
                <input
                  type="text"
                  inputMode="decimal"
                  className="fo-input"
                  placeholder="0,00"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  required
                  autoFocus={!isEdit}
                />
              </FieldGroup>

              {/* Rollover toggle */}
              <label className="fo-row cursor-pointer" style={{ gap: 10 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.rollover}
                  onClick={() => set('rollover', !form.rollover)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 999,
                    border: '1px solid var(--fo-border)',
                    background: form.rollover
                      ? 'rgba(16, 185, 129, 0.3)'
                      : 'rgba(255,255,255,0.06)',
                    position: 'relative',
                    transition: 'background 200ms ease',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: form.rollover ? '#34d399' : 'var(--fo-muted)',
                      position: 'absolute',
                      top: 2,
                      left: form.rollover ? 19 : 2,
                      transition: 'left 200ms ease, background 200ms ease',
                    }}
                  />
                </button>
                <div>
                  <span className="text-sm">Übertrag aktivieren</span>
                  <p className="text-xs text-[var(--fo-muted)]" style={{ marginTop: 2 }}>
                    Nicht verwendetes Geld wird in den Folgemonat uebertragen.
                  </p>
                </div>
              </label>

              {/* Error */}
              {saveMutation.isError && (
                <div
                  className="text-xs px-3 py-2 rounded"
                  style={{
                    background: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                  }}
                >
                  Fehler beim Speichern. Bitte versuche es erneut.
                </div>
              )}

              {/* Actions */}
              <div
                className="fo-row"
                style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}
              >
                <button
                  type="button"
                  className="fo-btn-secondary"
                  style={{ padding: '8px 16px', fontSize: 13 }}
                  onClick={onClose}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="fo-btn"
                  style={{ padding: '8px 16px', fontSize: 13 }}
                  disabled={isSaving || (!isEdit && availableCategories.length === 0)}
                >
                  {isSaving
                    ? 'Speichern...'
                    : isEdit
                      ? 'Aktualisieren'
                      : 'Budget anlegen'}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function FieldGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label className="text-xs font-medium text-[var(--fo-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}
