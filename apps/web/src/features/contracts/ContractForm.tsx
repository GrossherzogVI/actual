import { useCallback, useEffect, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { createContract, updateContract } from '../../core/api/finance-api';
import type { Contract } from '../../core/types/finance';
import { TYPE_CONFIG, INTERVAL_LABELS } from './ContractCard';

type ContractFormProps = {
  contract?: Contract;
  open: boolean;
  onClose: () => void;
};

type FormData = {
  name: string;
  provider: string;
  type: Contract['type'];
  amount: string;
  interval: Contract['interval'];
  start_date: string;
  end_date: string;
  notice_period_months: string;
  auto_renewal: boolean;
};

const EMPTY_FORM: FormData = {
  name: '',
  provider: '',
  type: 'subscription',
  amount: '',
  interval: 'monthly',
  start_date: '',
  end_date: '',
  notice_period_months: '',
  auto_renewal: true,
};

function contractToForm(c: Contract): FormData {
  return {
    name: c.name,
    provider: c.provider,
    type: c.type,
    amount: String(c.amount),
    interval: c.interval,
    start_date: c.start_date ?? '',
    end_date: c.end_date ?? '',
    notice_period_months: c.notice_period_months != null ? String(c.notice_period_months) : '',
    auto_renewal: c.auto_renewal,
  };
}

export function ContractForm({ contract, open, onClose }: ContractFormProps) {
  const queryClient = useQueryClient();
  const isEdit = !!contract;

  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm(contract ? contractToForm(contract) : EMPTY_FORM);
    }
  }, [open, contract]);

  const set = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) =>
      setForm(prev => ({ ...prev, [key]: value })),
    [],
  );

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof createContract>[0]) => createContract(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contract> }) =>
      updateContract(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      onClose();
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const parsedAmount = parseFloat(form.amount.replace(',', '.'));
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (!form.name.trim() || !form.provider.trim()) return;

    const payload = {
      name: form.name.trim(),
      provider: form.provider.trim(),
      type: form.type,
      amount: parsedAmount,
      interval: form.interval,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      notice_period_months: form.notice_period_months
        ? parseInt(form.notice_period_months, 10)
        : undefined,
      auto_renewal: form.auto_renewal,
    };

    if (isEdit && contract) {
      updateMutation.mutate({ id: contract.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
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
              width: 'min(520px, 96vw)',
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
                {isEdit ? 'Vertrag bearbeiten' : 'Neuer Vertrag'}
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
              <FieldGroup label="Bezeichnung">
                <input
                  type="text"
                  className="fo-input"
                  placeholder="z.B. Netflix, Haftpflicht..."
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  required
                />
              </FieldGroup>

              {/* Provider */}
              <FieldGroup label="Anbieter">
                <input
                  type="text"
                  className="fo-input"
                  placeholder="z.B. Netflix Inc., HUK-COBURG..."
                  value={form.provider}
                  onChange={e => set('provider', e.target.value)}
                  required
                />
              </FieldGroup>

              {/* Type */}
              <FieldGroup label="Typ">
                <select
                  className="fo-input"
                  value={form.type}
                  onChange={e => set('type', e.target.value as Contract['type'])}
                >
                  {(Object.keys(TYPE_CONFIG) as Contract['type'][]).map(key => (
                    <option key={key} value={key}>
                      {TYPE_CONFIG[key].label}
                    </option>
                  ))}
                </select>
              </FieldGroup>

              {/* Amount + Interval row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldGroup label="Betrag">
                  <input
                    type="text"
                    inputMode="decimal"
                    className="fo-input"
                    placeholder="0,00"
                    value={form.amount}
                    onChange={e => set('amount', e.target.value)}
                    required
                  />
                </FieldGroup>

                <FieldGroup label="Intervall">
                  <select
                    className="fo-input"
                    value={form.interval}
                    onChange={e => set('interval', e.target.value as Contract['interval'])}
                  >
                    {(Object.keys(INTERVAL_LABELS) as Contract['interval'][]).map(key => (
                      <option key={key} value={key}>
                        {INTERVAL_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </FieldGroup>
              </div>

              {/* Dates row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FieldGroup label="Startdatum">
                  <input
                    type="date"
                    className="fo-input"
                    value={form.start_date}
                    onChange={e => set('start_date', e.target.value)}
                  />
                </FieldGroup>

                <FieldGroup label="Enddatum">
                  <input
                    type="date"
                    className="fo-input"
                    value={form.end_date}
                    onChange={e => set('end_date', e.target.value)}
                  />
                </FieldGroup>
              </div>

              {/* Notice period */}
              <FieldGroup label="Kuendigungsfrist (Monate)">
                <input
                  type="number"
                  min="0"
                  className="fo-input"
                  placeholder="z.B. 3"
                  value={form.notice_period_months}
                  onChange={e => set('notice_period_months', e.target.value)}
                />
              </FieldGroup>

              {/* Auto renewal toggle */}
              <label
                className="fo-row cursor-pointer"
                style={{ gap: 10 }}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.auto_renewal}
                  onClick={() => set('auto_renewal', !form.auto_renewal)}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 999,
                    border: '1px solid var(--fo-border)',
                    background: form.auto_renewal
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
                      background: form.auto_renewal ? '#34d399' : 'var(--fo-muted)',
                      position: 'absolute',
                      top: 2,
                      left: form.auto_renewal ? 19 : 2,
                      transition: 'left 200ms ease, background 200ms ease',
                    }}
                  />
                </button>
                <span className="text-sm">Automatische Verlaengerung</span>
              </label>

              {/* Error display */}
              {(createMutation.isError || updateMutation.isError) && (
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
