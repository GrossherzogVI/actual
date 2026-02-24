import { useCallback, useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { createCategory, listCategories } from '../../core/api/finance-api';
import type { Category } from '../../core/types/finance';
import { CategoryColorPicker } from './CategoryColorPicker';

type CategoryFormProps = {
  /** Pass a category to pre-fill for edit mode. undefined = create mode. */
  category?: Category;
  open: boolean;
  onClose: () => void;
};

type FormData = {
  name: string;
  parent: string;
  color: string;
  icon: string;
  is_income: boolean;
};

const EMPTY_FORM: FormData = {
  name: '',
  parent: '',
  color: '',
  icon: '',
  is_income: false,
};

function categoryToForm(c: Category): FormData {
  return {
    name: c.name,
    parent: c.parent ?? '',
    color: c.color ?? '',
    icon: c.icon ?? '',
    is_income: c.is_income,
  };
}

export function CategoryForm({ category, open, onClose }: CategoryFormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!category;

  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  // Fetch categories for parent dropdown
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  // L1 groups = categories without parent
  const l1Groups = useMemo(
    () => (categories ?? []).filter(c => !c.parent),
    [categories],
  );

  useEffect(() => {
    if (open) {
      setForm(category ? categoryToForm(category) : EMPTY_FORM);
    }
  }, [open, category]);

  const set = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) =>
      setForm(prev => ({ ...prev, [key]: value })),
    [],
  );

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createCategory>[0]) => createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      onClose();
    },
  });

  const isSaving = createMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.name.trim()) return;

    const payload: Parameters<typeof createCategory>[0] = {
      name: form.name.trim(),
      parent: form.parent || undefined,
      color: form.color || undefined,
      icon: form.icon || undefined,
      is_income: form.is_income,
    };

    createMutation.mutate(payload);
  }

  return (
    <AnimatePresence>
      {open && (
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

          {/* Slide-over panel */}
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
                {isEdit ? 'Kategorie bearbeiten' : 'Neue Kategorie erstellen'}
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
              style={{ padding: 20, display: 'grid', gap: 16, alignContent: 'start' }}
              onSubmit={handleSubmit}
            >
              {/* Name */}
              <FieldGroup label="Name">
                <input
                  type="text"
                  className="fo-input"
                  placeholder="z.B. Lebensmittel, Gehalt..."
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  required
                  autoFocus
                />
              </FieldGroup>

              {/* Parent group */}
              <FieldGroup label="Uebergeordnete Gruppe">
                <select
                  className="fo-input"
                  value={form.parent}
                  onChange={e => set('parent', e.target.value)}
                >
                  <option value="">Keine (L1 Hauptgruppe)</option>
                  {l1Groups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.icon ? `${g.icon} ` : ''}{g.name}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              {/* Color */}
              <FieldGroup label="Farbe">
                <CategoryColorPicker
                  value={form.color || undefined}
                  onChange={color => set('color', color)}
                />
              </FieldGroup>

              {/* Icon (emoji) */}
              <FieldGroup label="Icon (Emoji)">
                <div className="fo-row" style={{ gap: 8 }}>
                  {form.icon && (
                    <span style={{ fontSize: 20 }}>{form.icon}</span>
                  )}
                  <input
                    type="text"
                    className="fo-input"
                    style={{ width: 80, textAlign: 'center' }}
                    placeholder="🏠"
                    value={form.icon}
                    onChange={e => set('icon', e.target.value)}
                    maxLength={4}
                  />
                  <span className="text-xs text-[var(--fo-muted)]">
                    Emoji einfuegen oder leer lassen
                  </span>
                </div>
              </FieldGroup>

              {/* Is income toggle */}
              <label
                className="fo-row cursor-pointer"
                style={{ gap: 10 }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.is_income}
                  onClick={() => set('is_income', !form.is_income)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 999,
                    border: '1px solid var(--fo-border)',
                    background: form.is_income
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
                      background: form.is_income ? '#34d399' : 'var(--fo-muted)',
                      position: 'absolute',
                      top: 2,
                      left: form.is_income ? 19 : 2,
                      transition: 'left 200ms ease, background 200ms ease',
                    }}
                  />
                </button>
                <span className="text-sm">Einnahmen-Kategorie</span>
              </label>

              {/* Error display */}
              {createMutation.isError && (
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
              <div className="fo-row" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
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
                  disabled={isSaving}
                >
                  {isSaving ? 'Speichern...' : isEdit ? 'Aktualisieren' : 'Erstellen'}
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
