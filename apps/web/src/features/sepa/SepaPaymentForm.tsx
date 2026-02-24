import { useEffect, useState } from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { createSepaPayment } from './sepa-api';
import { extractBic, formatIban, validateIban } from './iban-utils';
import type { SepaPaymentDraft } from './types';

type SepaPaymentFormProps = {
  open: boolean;
  onClose: () => void;
  prefill?: {
    payee_name?: string;
    iban?: string;
    amount?: number;
    reference?: string;
    contract?: string;
  };
};

type FormData = {
  payee_name: string;
  iban: string;
  bic: string;
  amount: string;
  reference: string;
  execution_date: string;
};

const today = () => new Date().toISOString().slice(0, 10);

function emptyForm(): FormData {
  return {
    payee_name: '',
    iban: '',
    bic: '',
    amount: '',
    reference: '',
    execution_date: today(),
  };
}

function FieldGroup({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <label className="text-xs font-medium text-[var(--fo-muted)]">{label}</label>
      {children}
      {error && (
        <span className="text-xs" style={{ color: '#f87171' }}>
          {error}
        </span>
      )}
    </div>
  );
}

export function SepaPaymentForm({ open, onClose, prefill }: SepaPaymentFormProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(emptyForm());
  const [ibanError, setIbanError] = useState<string | undefined>();

  useEffect(() => {
    if (open) {
      setForm({
        payee_name: prefill?.payee_name ?? '',
        iban: prefill?.iban ?? '',
        bic: prefill?.iban ? (extractBic(prefill.iban) ?? '') : '',
        amount: prefill?.amount != null ? String(prefill.amount) : '',
        reference: prefill?.reference ?? '',
        execution_date: today(),
      });
      setIbanError(undefined);
    }
  }, [open, prefill]);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm(prev => ({ ...prev, [key]: value }));

  function handleIbanChange(raw: string) {
    set('iban', raw);
    const validation = validateIban(raw);
    if (!validation.valid && raw.replace(/\s/g, '').length >= 15) {
      setIbanError(validation.error);
    } else {
      setIbanError(undefined);
    }
    // Auto-fill BIC
    const bic = extractBic(raw);
    if (bic) set('bic', bic);
  }

  const mutation = useMutation({
    mutationFn: (draft: SepaPaymentDraft) => createSepaPayment(draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sepa-payments'] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validation = validateIban(form.iban);
    if (!validation.valid) {
      setIbanError(validation.error);
      return;
    }

    const amount = parseFloat(form.amount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;
    if (!form.payee_name.trim() || !form.bic.trim()) return;

    const draft: SepaPaymentDraft = {
      payee_name: form.payee_name.trim(),
      iban: form.iban.replace(/\s/g, '').toUpperCase(),
      bic: form.bic.trim().toUpperCase(),
      amount,
      reference: form.reference.trim(),
      execution_date: form.execution_date,
      status: 'draft',
      contract: prefill?.contract,
    };

    mutation.mutate(draft);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
            style={{
              width: 'min(480px, 96vw)',
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
              style={{ padding: '16px 20px', borderBottom: '1px solid var(--fo-border)' }}
            >
              <div className="fo-row" style={{ gap: 8 }}>
                <CreditCard size={16} style={{ color: 'var(--fo-accent)' }} />
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                  SEPA-Zahlung anlegen
                </h2>
              </div>
              <button
                type="button"
                className="fo-btn-secondary"
                style={{ padding: 6, borderRadius: 6 }}
                onClick={onClose}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form
              className="flex-1 overflow-auto"
              style={{ padding: 20, display: 'grid', gap: 16, alignContent: 'start' }}
              onSubmit={handleSubmit}
            >
              <FieldGroup label="Empfänger">
                <input
                  type="text"
                  className="fo-input"
                  placeholder="Name des Empfängers"
                  value={form.payee_name}
                  onChange={e => set('payee_name', e.target.value)}
                  required
                />
              </FieldGroup>

              <FieldGroup label="IBAN" error={ibanError}>
                <input
                  type="text"
                  className="fo-input"
                  placeholder="DE89 3704 0044 0532 0130 00"
                  value={formatIban(form.iban)}
                  onChange={e => handleIbanChange(e.target.value)}
                  maxLength={42}
                  required
                />
              </FieldGroup>

              <FieldGroup label="BIC">
                <input
                  type="text"
                  className="fo-input"
                  placeholder="Auto-Erkennung aus IBAN"
                  value={form.bic}
                  onChange={e => set('bic', e.target.value.toUpperCase())}
                  required
                />
              </FieldGroup>

              <FieldGroup label="Betrag (EUR)">
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

              <FieldGroup label="Verwendungszweck">
                <input
                  type="text"
                  className="fo-input"
                  placeholder="z.B. Vertragsnummer 12345"
                  value={form.reference}
                  onChange={e => set('reference', e.target.value)}
                  maxLength={140}
                />
              </FieldGroup>

              <FieldGroup label="Ausführungsdatum">
                <input
                  type="date"
                  className="fo-input"
                  value={form.execution_date}
                  min={today()}
                  onChange={e => set('execution_date', e.target.value)}
                  required
                />
              </FieldGroup>

              {mutation.isError && (
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
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? 'Speichern...' : 'Zahlung anlegen'}
                </button>
              </div>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
