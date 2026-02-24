import { useCallback, useEffect, useRef, useState } from 'react';

import * as Dialog from '@radix-ui/react-dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  Coffee,
  Fuel,
  Minus,
  Plus,
  ShoppingCart,
  Train,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import {
  createTransaction,
  listAccounts,
  listCategories,
} from '../../core/api/finance-api';
import type { Category } from '../../core/types/finance';
import { useCalculator } from './useCalculator';
import { useCategorySearch } from './useCategorySearch';

type QuickAddOverlayProps = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

const PRESETS = [
  { label: 'Einkauf', icon: ShoppingCart },
  { label: 'Kaffee', icon: Coffee },
  { label: '\u00d6PNV', icon: Train },
  { label: 'Restaurant', icon: UtensilsCrossed },
  { label: 'Tanken', icon: Fuel },
] as const;

function formatDateDE(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

function parseDateDE(input: string): Date | null {
  const match = input.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

const eurFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

function initialFormState() {
  return {
    amountExpr: '',
    isExpense: true,
    accountId: '',
    categoryId: '',
    categorySearch: '',
    notes: '',
    dateStr: formatDateDE(new Date()),
  };
}

export function QuickAddOverlay({
  open,
  onClose,
  onSaved,
}: QuickAddOverlayProps) {
  const [form, setForm] = useState(initialFormState);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState<'close' | 'new'>('close');

  const amountRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
    enabled: open,
  });

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
    enabled: open,
  });

  const calculatedAmount = useCalculator(form.amountExpr);
  const { flat: filteredCategories } = useCategorySearch(
    form.categorySearch,
    categories ?? [],
  );

  // Auto-select first account if none selected
  useEffect(() => {
    if (accounts && accounts.length > 0 && !form.accountId) {
      setForm(prev => ({ ...prev, accountId: accounts[0].id }));
    }
  }, [accounts, form.accountId]);

  // Focus amount input when opening
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => amountRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Close category dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        categoryInputRef.current &&
        !categoryInputRef.current.contains(e.target as Node)
      ) {
        setShowCategoryDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const resetForm = useCallback(() => {
    setForm(initialFormState());
  }, []);

  const handleSave = useCallback(
    async (mode: 'close' | 'new') => {
      if (calculatedAmount === 0 || !form.accountId) return;
      setSaving(true);
      setSaveMode(mode);

      const finalAmount = form.isExpense
        ? -Math.abs(calculatedAmount)
        : Math.abs(calculatedAmount);

      const parsedDate = parseDateDE(form.dateStr);
      const dateISO = parsedDate
        ? parsedDate.toISOString()
        : new Date().toISOString();

      try {
        await createTransaction({
          date: dateISO,
          amount: finalAmount,
          account: form.accountId,
          category: form.categoryId || undefined,
          notes: form.notes || undefined,
        });

        await queryClient.invalidateQueries({ queryKey: ['transactions'] });
        onSaved?.();

        if (mode === 'new') {
          setForm(prev => ({
            ...initialFormState(),
            accountId: prev.accountId,
          }));
          setTimeout(() => amountRef.current?.focus(), 50);
        } else {
          resetForm();
          onClose();
        }
      } finally {
        setSaving(false);
      }
    },
    [calculatedAmount, form, onClose, onSaved, queryClient, resetForm],
  );

  // Keyboard shortcut: Cmd+Enter = Save + New
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSave('new');
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleSave]);

  function selectCategory(cat: Category) {
    setForm(prev => ({
      ...prev,
      categoryId: cat.id,
      categorySearch: cat.name,
    }));
    setShowCategoryDropdown(false);
  }

  function selectPreset(label: string) {
    const match = (categories ?? []).find(
      c => c.name.toLowerCase() === label.toLowerCase(),
    );
    if (match) {
      setForm(prev => ({
        ...prev,
        categoryId: match.id,
        categorySearch: match.name,
      }));
    } else {
      setForm(prev => ({ ...prev, categorySearch: label }));
    }
    setShowCategoryDropdown(false);
  }

  const selectedCategoryName =
    (categories ?? []).find(c => c.id === form.categoryId)?.name ?? '';

  const displayAmount = calculatedAmount
    ? eurFormatter.format(
        form.isExpense
          ? -Math.abs(calculatedAmount)
          : Math.abs(calculatedAmount),
      )
    : eurFormatter.format(0);

  const isLoading = accountsLoading || categoriesLoading;
  const hasExpression =
    form.amountExpr.includes('+') || form.amountExpr.includes('-');

  return (
    <Dialog.Root open={open} onOpenChange={val => !val && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh]"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <div
                  className="w-full max-w-[480px] mx-4 rounded-xl border border-[var(--fo-border)] bg-[var(--fo-panel)] p-5"
                  style={{
                    boxShadow:
                      '0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset',
                  }}
                >
                  {/* Header */}
                  <div className="fo-space-between mb-4">
                    <Dialog.Title className="text-base font-semibold m-0 text-[var(--fo-text)]">
                      Transaktion erfassen
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="fo-btn-secondary p-1.5 rounded-md"
                        aria-label="Schliessen"
                      >
                        <X size={16} />
                      </button>
                    </Dialog.Close>
                  </div>

                  {isLoading ? (
                    <div className="fo-stack">
                      {[1, 2, 3, 4].map(i => (
                        <div
                          key={i}
                          className="h-10 rounded-md bg-[var(--fo-bg)] animate-pulse"
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="fo-stack" style={{ gap: 16 }}>
                      {/* Amount display */}
                      <div className="text-center py-3">
                        <div
                          className={`text-3xl font-semibold tracking-tight ${
                            form.isExpense
                              ? 'text-red-400'
                              : 'text-emerald-400'
                          }`}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {displayAmount}
                        </div>
                        {hasExpression && (
                          <small className="text-[var(--fo-muted)] text-xs mt-1 block font-mono">
                            = {form.amountExpr}
                          </small>
                        )}
                      </div>

                      {/* Amount input + sign toggle */}
                      <div className="fo-row" style={{ gap: 8 }}>
                        <button
                          type="button"
                          className={`flex items-center justify-center w-9 h-9 rounded-lg border cursor-pointer transition-all duration-150 ${
                            form.isExpense
                              ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          }`}
                          onClick={() =>
                            setForm(prev => ({
                              ...prev,
                              isExpense: !prev.isExpense,
                            }))
                          }
                          title={
                            form.isExpense
                              ? 'Ausgabe (klicken fuer Einnahme)'
                              : 'Einnahme (klicken fuer Ausgabe)'
                          }
                        >
                          {form.isExpense ? (
                            <Minus size={16} />
                          ) : (
                            <Plus size={16} />
                          )}
                        </button>
                        <input
                          ref={amountRef}
                          type="text"
                          inputMode="decimal"
                          className="fo-input text-lg flex-1"
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                          placeholder="0,00 oder 12,50+8,30"
                          value={form.amountExpr}
                          onChange={e =>
                            setForm(prev => ({
                              ...prev,
                              amountExpr: e.target.value,
                            }))
                          }
                        />
                      </div>

                      {/* Account selector */}
                      <div className="fo-stack" style={{ gap: 4 }}>
                        <label className="text-xs text-[var(--fo-muted)] font-medium">
                          Konto
                        </label>
                        <div className="relative">
                          <select
                            className="fo-input appearance-none pr-8 cursor-pointer"
                            value={form.accountId}
                            onChange={e =>
                              setForm(prev => ({
                                ...prev,
                                accountId: e.target.value,
                              }))
                            }
                          >
                            {(accounts ?? []).map(acc => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={14}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fo-muted)] pointer-events-none"
                          />
                        </div>
                      </div>

                      {/* Category search */}
                      <div className="fo-stack" style={{ gap: 4 }}>
                        <label className="text-xs text-[var(--fo-muted)] font-medium">
                          Kategorie
                        </label>
                        <div className="relative">
                          <input
                            ref={categoryInputRef}
                            type="text"
                            className="fo-input"
                            placeholder="Kategorie suchen..."
                            value={form.categorySearch}
                            onChange={e => {
                              setForm(prev => ({
                                ...prev,
                                categorySearch: e.target.value,
                                categoryId:
                                  e.target.value !== selectedCategoryName
                                    ? ''
                                    : prev.categoryId,
                              }));
                              setShowCategoryDropdown(true);
                            }}
                            onFocus={() => setShowCategoryDropdown(true)}
                          />

                          {/* Category dropdown */}
                          <AnimatePresence>
                            {showCategoryDropdown &&
                              filteredCategories.length > 0 && (
                                <motion.div
                                  ref={dropdownRef}
                                  className="absolute top-full left-0 right-0 mt-1 z-10 max-h-52 overflow-auto rounded-lg border border-[var(--fo-border)] bg-[var(--fo-bg-2)]"
                                  style={{
                                    boxShadow:
                                      '0 8px 24px rgba(0,0,0,0.5)',
                                  }}
                                  initial={{ opacity: 0, y: -4 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -4 }}
                                  transition={{ duration: 0.12 }}
                                >
                                  {filteredCategories.slice(0, 12).map(cat => (
                                    <button
                                      key={cat.id}
                                      type="button"
                                      className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors duration-100 ${
                                        cat.id === form.categoryId
                                          ? 'bg-[rgba(255,255,255,0.08)] text-[var(--fo-text)]'
                                          : 'text-[var(--fo-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--fo-text)]'
                                      }`}
                                      onClick={() => selectCategory(cat)}
                                    >
                                      {cat.color && (
                                        <span
                                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                                          style={{
                                            backgroundColor: cat.color,
                                          }}
                                        />
                                      )}
                                      <span>{cat.name}</span>
                                      {cat.parent && (
                                        <small className="text-[var(--fo-muted)] ml-auto text-xs">
                                          {
                                            (categories ?? []).find(
                                              c => c.id === cat.parent,
                                            )?.name
                                          }
                                        </small>
                                      )}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                          </AnimatePresence>
                        </div>

                        {/* Preset chips */}
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {PRESETS.map(preset => {
                            const Icon = preset.icon;
                            const isActive =
                              form.categorySearch.toLowerCase() ===
                              preset.label.toLowerCase();
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border cursor-pointer transition-all duration-100 ${
                                  isActive
                                    ? 'border-[var(--fo-info)] bg-[rgba(59,130,246,0.12)] text-[var(--fo-text)]'
                                    : 'border-[var(--fo-border)] bg-transparent text-[var(--fo-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--fo-text)]'
                                }`}
                                onClick={() => selectPreset(preset.label)}
                              >
                                <Icon size={12} />
                                <span>{preset.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Date */}
                      <div className="fo-stack" style={{ gap: 4 }}>
                        <label className="text-xs text-[var(--fo-muted)] font-medium">
                          Datum
                        </label>
                        <div className="fo-row" style={{ gap: 8 }}>
                          <Calendar
                            size={16}
                            className="text-[var(--fo-muted)] flex-shrink-0"
                          />
                          <input
                            type="text"
                            className="fo-input flex-1"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                            placeholder="TT.MM.JJJJ"
                            value={form.dateStr}
                            onChange={e =>
                              setForm(prev => ({
                                ...prev,
                                dateStr: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>

                      {/* Notes */}
                      <div className="fo-stack" style={{ gap: 4 }}>
                        <label className="text-xs text-[var(--fo-muted)] font-medium">
                          Notizen
                        </label>
                        <input
                          type="text"
                          className="fo-input"
                          placeholder="Optionale Notiz..."
                          value={form.notes}
                          onChange={e =>
                            setForm(prev => ({
                              ...prev,
                              notes: e.target.value,
                            }))
                          }
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-3 border-t border-[var(--fo-border)]">
                        <div className="flex items-center gap-1.5">
                          <kbd className="fo-kbd text-xs">Esc</kbd>
                          <span className="text-xs text-[var(--fo-muted)]">
                            Abbrechen
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="fo-btn-secondary text-sm px-3 py-1.5 inline-flex items-center gap-1"
                            onClick={() => void handleSave('new')}
                            disabled={saving || calculatedAmount === 0}
                            title="Cmd+Enter"
                          >
                            {saving && saveMode === 'new'
                              ? 'Speichert...'
                              : 'Speichern + Neu'}
                            <kbd className="fo-kbd text-[10px]">
                              {'\u2318\u21B5'}
                            </kbd>
                          </button>
                          <button
                            type="button"
                            className="fo-btn text-sm px-4 py-1.5"
                            onClick={() => void handleSave('close')}
                            disabled={saving || calculatedAmount === 0}
                          >
                            {saving && saveMode === 'close'
                              ? 'Speichert...'
                              : 'Speichern'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
