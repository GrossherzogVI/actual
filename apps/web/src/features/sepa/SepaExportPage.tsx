import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Download, Plus, Send, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { formatEur } from '@/core/utils/format';

import { createSepaBatch, deleteSepaPayment, listSepaPayments } from './sepa-api';
import { generateSepaXml, downloadXml } from './sepa-xml';
import { formatIban } from './iban-utils';
import { SepaPaymentForm } from './SepaPaymentForm';
import type { PayerInfo, SepaPayment } from './types';

// Persisted payer info (localStorage fallback for now — SurrealDB user_pref not yet wired)
function loadPayerInfo(): PayerInfo {
  try {
    const raw = localStorage.getItem('sepa_payer');
    if (raw) return JSON.parse(raw) as PayerInfo;
  } catch {
    // ignore
  }
  return { name: '', iban: '', bic: '' };
}

function savePayerInfo(info: PayerInfo): void {
  localStorage.setItem('sepa_payer', JSON.stringify(info));
}

export function SepaExportPage() {
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [payer, setPayer] = useState<PayerInfo>(loadPayerInfo);
  const [payerDirty, setPayerDirty] = useState(false);
  const [xmlError, setXmlError] = useState<string | undefined>();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['sepa-payments'],
    queryFn: listSepaPayments,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSepaPayment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sepa-payments'] }),
  });

  const batchMutation = useMutation({
    mutationFn: ({ paymentIds, xml, total }: { paymentIds: string[]; xml: string; total: number }) =>
      createSepaBatch(paymentIds, xml, total),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sepa-payments'] }),
  });

  const draftPayments = payments.filter(p => p.status === 'draft');
  const selectedPayments = draftPayments.filter(p => selected.has(p.id));
  const totalSelected = selectedPayments.reduce((s, p) => s + p.amount, 0);

  function toggleAll() {
    if (selected.size === draftPayments.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(draftPayments.map(p => p.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePayerChange(field: keyof PayerInfo, value: string) {
    const updated = { ...payer, [field]: value };
    setPayer(updated);
    setPayerDirty(true);
  }

  function savePayer() {
    savePayerInfo(payer);
    setPayerDirty(false);
  }

  function handleExport() {
    setXmlError(undefined);

    if (selectedPayments.length === 0) {
      setXmlError('Bitte mindestens eine Zahlung auswählen.');
      return;
    }

    if (!payer.name.trim() || !payer.iban.trim() || !payer.bic.trim()) {
      setXmlError('Bitte Auftraggeber-Daten vollständig ausfüllen.');
      return;
    }

    const result = generateSepaXml(selectedPayments, payer);

    if (!result.ok) {
      const msg = result.errors.map(e => `${e.payee_name}: ${e.error}`).join('; ');
      setXmlError(`IBAN-Fehler: ${msg}`);
      return;
    }

    const filename = `sepa-${new Date().toISOString().slice(0, 10)}.xml`;
    downloadXml(result.xml, filename);

    batchMutation.mutate({
      paymentIds: selectedPayments.map(p => p.id),
      xml: result.xml,
      total: totalSelected,
    });
  }

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div className="fo-space-between" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="text-lg font-semibold" style={{ margin: 0 }}>
            SEPA-Überweisungen
          </h1>
          <p className="text-xs text-[var(--fo-muted)]" style={{ margin: '4px 0 0' }}>
            Zahlungen vorbereiten und als pain.001.003.03-Datei exportieren
          </p>
        </div>
        <button
          type="button"
          className="fo-btn fo-row"
          style={{ gap: 6, padding: '8px 14px', fontSize: 13 }}
          onClick={() => setShowForm(true)}
        >
          <Plus size={14} />
          Zahlung hinzufügen
        </button>
      </div>

      {/* Auftraggeber (Payer Info) */}
      <section
        className="fo-card"
        style={{ marginBottom: 24 }}
      >
        <div className="fo-row" style={{ gap: 8, marginBottom: 14 }}>
          <CreditCard size={15} style={{ color: 'var(--fo-accent)' }} />
          <h2 className="text-sm font-semibold" style={{ margin: 0 }}>
            Auftraggeber
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="text-xs text-[var(--fo-muted)]">Name</label>
            <input
              type="text"
              className="fo-input"
              placeholder="Max Mustermann"
              value={payer.name}
              onChange={e => handlePayerChange('name', e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="text-xs text-[var(--fo-muted)]">IBAN</label>
            <input
              type="text"
              className="fo-input"
              placeholder="DE89 3704 0044 ..."
              value={payer.iban}
              onChange={e => handlePayerChange('iban', e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="text-xs text-[var(--fo-muted)]">BIC</label>
            <input
              type="text"
              className="fo-input"
              placeholder="DEUTDEBBXXX"
              value={payer.bic}
              onChange={e => handlePayerChange('bic', e.target.value.toUpperCase())}
            />
          </div>
        </div>
        {payerDirty && (
          <div style={{ marginTop: 10, textAlign: 'right' }}>
            <button
              type="button"
              className="fo-btn"
              style={{ padding: '6px 12px', fontSize: 12 }}
              onClick={savePayer}
            >
              Speichern
            </button>
          </div>
        )}
      </section>

      {/* Export bar */}
      <div
        className="fo-row"
        style={{
          marginBottom: 16,
          padding: '10px 14px',
          borderRadius: 8,
          background: selected.size > 0 ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255,255,255,0.03)',
          border: '1px solid var(--fo-border)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <span className="text-sm text-[var(--fo-muted)]">
          {selected.size > 0
            ? `${selected.size} Zahlung${selected.size !== 1 ? 'en' : ''} ausgewählt · ${formatEur(totalSelected)}`
            : 'Keine Zahlungen ausgewählt'}
        </span>
        <div style={{ flex: 1 }} />
        {xmlError && (
          <span className="text-xs" style={{ color: '#f87171' }}>
            {xmlError}
          </span>
        )}
        <button
          type="button"
          className="fo-btn fo-row"
          style={{ gap: 6, padding: '7px 14px', fontSize: 13 }}
          onClick={handleExport}
          disabled={selected.size === 0 || batchMutation.isPending}
        >
          <Download size={13} />
          {batchMutation.isPending ? 'Exportiere...' : 'SEPA-Datei erstellen'}
        </button>
      </div>

      {/* Payment list */}
      {isLoading ? (
        <div className="text-sm text-[var(--fo-muted)]" style={{ textAlign: 'center', padding: 40 }}>
          Lade Zahlungen...
        </div>
      ) : draftPayments.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : (
        <div style={{ display: 'grid', gap: 0 }}>
          {/* Column headers */}
          <div
            className="fo-row text-xs text-[var(--fo-muted)]"
            style={{
              padding: '6px 12px',
              gap: 12,
              borderBottom: '1px solid var(--fo-border)',
            }}
          >
            <input
              type="checkbox"
              checked={selected.size === draftPayments.length && draftPayments.length > 0}
              onChange={toggleAll}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ flex: 2 }}>Empfänger</span>
            <span style={{ flex: 2 }}>IBAN</span>
            <span style={{ flex: 1, textAlign: 'right' }}>Betrag</span>
            <span style={{ flex: 1 }}>Datum</span>
            <span style={{ width: 32 }} />
          </div>

          <AnimatePresence initial={false}>
            {draftPayments.map(payment => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                checked={selected.has(payment.id)}
                onToggle={() => toggleOne(payment.id)}
                onDelete={() => deleteMutation.mutate(payment.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Exported payments */}
      {payments.some(p => p.status !== 'draft') && (
        <div style={{ marginTop: 32 }}>
          <h2 className="text-sm font-semibold text-[var(--fo-muted)]" style={{ marginBottom: 12 }}>
            Exportierte Zahlungen
          </h2>
          <div style={{ display: 'grid', gap: 0 }}>
            {payments
              .filter(p => p.status !== 'draft')
              .map(payment => (
                <PaymentRow
                  key={payment.id}
                  payment={payment}
                  checked={false}
                  onToggle={() => {}}
                  onDelete={() => deleteMutation.mutate(payment.id)}
                  readOnly
                />
              ))}
          </div>
        </div>
      )}

      <SepaPaymentForm open={showForm} onClose={() => setShowForm(false)} />
    </div>
  );
}

type PaymentRowProps = {
  payment: SepaPayment;
  checked: boolean;
  onToggle: () => void;
  onDelete: () => void;
  readOnly?: boolean;
};

function PaymentRow({ payment, checked, onToggle, onDelete, readOnly }: PaymentRowProps) {
  return (
    <motion.div
      className="fo-row"
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      style={{
        padding: '10px 12px',
        gap: 12,
        borderBottom: '1px solid var(--fo-border)',
        opacity: readOnly ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={readOnly}
        style={{ cursor: readOnly ? 'default' : 'pointer' }}
      />
      <span className="text-sm" style={{ flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {payment.payee_name}
        {payment.reference && (
          <span className="text-xs text-[var(--fo-muted)]" style={{ marginLeft: 8 }}>
            {payment.reference}
          </span>
        )}
      </span>
      <span className="text-xs text-[var(--fo-muted)]" style={{ flex: 2, fontFamily: 'monospace' }}>
        {formatIban(payment.iban)}
      </span>
      <span className="text-sm font-semibold tabular-nums" style={{ flex: 1, textAlign: 'right' }}>
        {formatEur(payment.amount)}
      </span>
      <span className="text-xs text-[var(--fo-muted)]" style={{ flex: 1 }}>
        {new Date(payment.execution_date).toLocaleDateString('de-DE')}
      </span>
      <div style={{ width: 32, display: 'flex', justifyContent: 'center' }}>
        {payment.status === 'draft' && (
          <button
            type="button"
            className="fo-btn-secondary"
            style={{ padding: 4, borderRadius: 4 }}
            onClick={onDelete}
            aria-label="Zahlung löschen"
          >
            <Trash2 size={12} style={{ color: '#f87171' }} />
          </button>
        )}
        {payment.status === 'exported' && (
          <Send size={12} style={{ color: 'var(--fo-muted)' }} />
        )}
      </div>
    </motion.div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '60px 24px',
        borderRadius: 10,
        border: '1px dashed var(--fo-border)',
      }}
    >
      <CreditCard size={32} style={{ color: 'var(--fo-muted)', margin: '0 auto 12px' }} />
      <p className="text-sm text-[var(--fo-muted)]">Noch keine SEPA-Zahlungen vorhanden.</p>
      <button
        type="button"
        className="fo-btn fo-row"
        style={{ gap: 6, padding: '8px 16px', fontSize: 13, margin: '16px auto 0' }}
        onClick={onAdd}
      >
        <Plus size={14} />
        Erste Zahlung anlegen
      </button>
    </div>
  );
}
