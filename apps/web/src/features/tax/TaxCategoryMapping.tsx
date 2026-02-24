import { useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { motion } from 'motion/react';

import { EUER_LINE_LABELS } from './tax-category-map';
import {
  fetchCategoriesWithMappings,
  upsertTaxMapping,
} from './tax-api';
import type { CategoryWithMapping } from './tax-api';
import type { EuerLine, VatRate } from './types';

const EUER_LINE_OPTIONS: { value: EuerLine; label: string }[] = (
  Object.entries(EUER_LINE_LABELS) as [EuerLine, string][]
).map(([value, label]) => ({ value, label }));

const VAT_OPTIONS: { value: VatRate; label: string }[] = [
  { value: 19, label: '19% Regelsteuersatz' },
  { value: 7, label: '7% ermäßigter Satz' },
  { value: 0, label: '0% steuerbefreit' },
];

type RowState = {
  euer_line: EuerLine;
  vat_rate: VatRate;
  is_tax_relevant: boolean;
  dirty: boolean;
};

// ── Row component ─────────────────────────────────────────────────────────────

function MappingRow({
  cat,
  state,
  onChange,
  onSave,
  isSaving,
}: {
  cat: CategoryWithMapping;
  state: RowState;
  onChange: (patch: Partial<RowState>) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <tr className="border-b border-[var(--fo-border)] last:border-0 hover:bg-[rgba(255,255,255,0.01)]">
      {/* Category name */}
      <td className="px-4 py-2.5">
        <div className="text-sm">{cat.name}</div>
        <div className="text-xs text-[var(--fo-muted)]">
          {cat.is_income ? 'Einnahme' : 'Ausgabe'}
        </div>
      </td>

      {/* Steuerlich relevant toggle */}
      <td className="px-4 py-2.5 text-center">
        <button
          type="button"
          className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
            state.is_tax_relevant
              ? 'bg-[var(--fo-accent)]'
              : 'bg-[var(--fo-border)]'
          }`}
          onClick={() =>
            onChange({ is_tax_relevant: !state.is_tax_relevant, dirty: true })
          }
          aria-label={
            state.is_tax_relevant
              ? 'Steuerlich relevant'
              : 'Nicht relevant'
          }
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              state.is_tax_relevant ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </td>

      {/* EÜR Line selector */}
      <td className="px-4 py-2.5">
        <select
          className="w-full text-xs bg-[var(--fo-bg)] border border-[var(--fo-border)] rounded px-2 py-1 text-[var(--fo-text)] disabled:opacity-40"
          value={state.euer_line}
          disabled={!state.is_tax_relevant}
          onChange={e =>
            onChange({ euer_line: e.target.value as EuerLine, dirty: true })
          }
        >
          {EUER_LINE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>

      {/* VAT rate selector */}
      <td className="px-4 py-2.5">
        <select
          className="w-full text-xs bg-[var(--fo-bg)] border border-[var(--fo-border)] rounded px-2 py-1 text-[var(--fo-text)] disabled:opacity-40"
          value={state.vat_rate}
          disabled={!state.is_tax_relevant}
          onChange={e =>
            onChange({
              vat_rate: Number(e.target.value) as VatRate,
              dirty: true,
            })
          }
        >
          {VAT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </td>

      {/* Save button */}
      <td className="px-4 py-2.5 text-right">
        {state.dirty && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fo-btn fo-row text-xs"
            style={{ padding: '4px 10px', gap: 4 }}
            onClick={onSave}
            disabled={isSaving}
          >
            <Save size={11} />
            {isSaving ? 'Speichert…' : 'Speichern'}
          </motion.button>
        )}
      </td>
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function TaxCategoryMapping() {
  const queryClient = useQueryClient();

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories-with-tax-mappings'],
    queryFn: fetchCategoriesWithMappings,
  });

  // Local state: category id → row state
  const [rows, setRows] = useState<Map<string, RowState>>(new Map());

  // Initialize rows from server data when it arrives (once)
  const initializedRef = useRef(false);
  if (!initializedRef.current && categories && rows.size === 0) {
    const initial = new Map<string, RowState>();
    for (const cat of categories) {
      initial.set(cat.id, {
        euer_line: cat.mapping?.euer_line ?? 'sonstige_ausgaben',
        vat_rate: (cat.mapping?.vat_rate as VatRate) ?? 19,
        is_tax_relevant: cat.mapping?.is_tax_relevant ?? false,
        dirty: false,
      });
    }
    setRows(initial);
    initializedRef.current = true;
  }

  const saveMutation = useMutation({
    mutationFn: (params: {
      catId: string;
      state: RowState;
    }) =>
      upsertTaxMapping({
        category: params.catId,
        euer_line: params.state.euer_line,
        vat_rate: params.state.vat_rate,
        is_tax_relevant: params.state.is_tax_relevant,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tax-mappings'] });
      queryClient.invalidateQueries({
        queryKey: ['categories-with-tax-mappings'],
      });
      setRows(prev => {
        const next = new Map(prev);
        const existing = next.get(variables.catId);
        if (existing) next.set(variables.catId, { ...existing, dirty: false });
        return next;
      });
    },
  });

  function handleChange(catId: string, patch: Partial<RowState>) {
    setRows(prev => {
      const next = new Map(prev);
      const existing = next.get(catId) ?? {
        euer_line: 'sonstige_ausgaben' as EuerLine,
        vat_rate: 19 as VatRate,
        is_tax_relevant: false,
        dirty: false,
      };
      next.set(catId, { ...existing, ...patch });
      return next;
    });
  }

  function handleSave(catId: string) {
    const state = rows.get(catId);
    if (!state) return;
    saveMutation.mutate({ catId, state });
  }

  if (isLoading) {
    return (
      <div className="fo-stack" style={{ gap: 8 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-10 rounded-md bg-[var(--fo-bg)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  const cats = categories ?? [];

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <div>
          <h3 className="text-sm font-semibold">Kategorie-Zuordnung</h3>
          <p className="text-xs text-[var(--fo-muted)] mt-0.5">
            Weise jeder Kategorie eine EÜR-Position und einen Mehrwertsteuersatz
            zu.
          </p>
        </div>
      </header>

      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--fo-border)] text-[var(--fo-muted)] text-xs">
              <th className="text-left px-4 py-2 font-medium">Kategorie</th>
              <th className="text-center px-4 py-2 font-medium">
                Steuerl. relevant
              </th>
              <th className="text-left px-4 py-2 font-medium">EÜR-Position</th>
              <th className="text-left px-4 py-2 font-medium">MwSt.</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {cats.map(cat => {
              const state = rows.get(cat.id) ?? {
                euer_line: 'sonstige_ausgaben' as EuerLine,
                vat_rate: 19 as VatRate,
                is_tax_relevant: false,
                dirty: false,
              };
              return (
                <MappingRow
                  key={cat.id}
                  cat={cat}
                  state={state}
                  onChange={patch => handleChange(cat.id, patch)}
                  onSave={() => handleSave(cat.id)}
                  isSaving={
                    saveMutation.isPending &&
                    saveMutation.variables?.catId === cat.id
                  }
                />
              );
            })}
          </tbody>
        </table>

        {cats.length === 0 && (
          <div className="text-center py-8 text-sm text-[var(--fo-muted)]">
            Keine Kategorien gefunden.
          </div>
        )}
      </div>
    </section>
  );
}
