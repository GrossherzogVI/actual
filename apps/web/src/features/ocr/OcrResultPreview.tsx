import { useState } from 'react';

import { Check, FileImage, Loader2, Pencil } from 'lucide-react';
import { motion } from 'motion/react';

import { formatDate, formatEur } from '@/core/utils/format';

import type { Receipt, ReceiptItem } from './types';

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

type Props = {
  receipt: Receipt;
  onSave: (data: {
    extracted_amount?: number;
    extracted_date?: string;
    extracted_vendor?: string;
    extracted_items?: ReceiptItem[];
  }) => void;
  isSaving?: boolean;
};

export function OcrResultPreview({ receipt, onSave, isSaving }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [amount, setAmount] = useState(receipt.extracted_amount?.toString() ?? '');
  const [date, setDate] = useState(receipt.extracted_date ?? '');
  const [vendor, setVendor] = useState(receipt.extracted_vendor ?? '');

  const isProcessing = receipt.status === 'pending' || receipt.status === 'processing';
  const hasFailed = receipt.status === 'failed';
  const hasData = receipt.extracted_amount != null || receipt.extracted_vendor != null;

  function handleSave() {
    const parsedAmount = parseFloat(amount.replace(',', '.'));
    onSave({
      extracted_amount: isNaN(parsedAmount) ? undefined : parsedAmount,
      extracted_date: date || undefined,
      extracted_vendor: vendor || undefined,
      extracted_items: receipt.extracted_items,
    });
    setIsEditing(false);
  }

  return (
    <motion.div
      className="fo-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 16 }}
    >
      {/* Left: thumbnail */}
      <div
        style={{
          width: 120,
          height: 160,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--fo-border)',
          background: 'var(--fo-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {receipt.image_data && receipt.file_type.startsWith('image/') ? (
          <img
            src={`data:${receipt.file_type};base64,${receipt.image_data}`}
            alt={receipt.file_name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <FileImage size={32} style={{ color: 'var(--fo-muted)' }} />
        )}
      </div>

      {/* Right: extracted data */}
      <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
        {/* Header */}
        <div className="fo-space-between">
          <span className="text-sm font-semibold text-[var(--fo-text)]">
            {receipt.file_name}
          </span>
          {receipt.confidence != null && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{
                color: receipt.confidence >= 0.8 ? '#34d399' : receipt.confidence >= 0.5 ? '#eab308' : '#ef4444',
                backgroundColor: receipt.confidence >= 0.8
                  ? 'rgba(52,211,153,0.12)'
                  : receipt.confidence >= 0.5
                    ? 'rgba(234,179,8,0.12)'
                    : 'rgba(239,68,68,0.12)',
              }}
            >
              {formatConfidence(receipt.confidence)}
            </span>
          )}
        </div>

        {/* Processing state */}
        {isProcessing && (
          <div className="fo-row text-xs text-[var(--fo-muted)]" style={{ gap: 6 }}>
            <Loader2 size={14} className="animate-spin" />
            <span>OCR wird verarbeitet...</span>
          </div>
        )}

        {/* Failed state */}
        {hasFailed && (
          <div
            className="rounded-md px-3 py-2 text-xs"
            style={{
              backgroundColor: 'rgba(239,68,68,0.06)',
              border: '1px solid rgba(239,68,68,0.12)',
              color: '#f87171',
            }}
          >
            OCR-Erkennung fehlgeschlagen. Bitte Daten manuell eingeben.
          </div>
        )}

        {/* Extracted fields */}
        {(hasData || hasFailed) && (
          <div style={{ display: 'grid', gap: 8 }}>
            {isEditing ? (
              <>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label className="text-[10px] font-medium text-[var(--fo-muted)]">Betrag</label>
                  <input
                    className="fo-input"
                    style={{ fontSize: 13, padding: '6px 8px' }}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="z.B. 42,50"
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label className="text-[10px] font-medium text-[var(--fo-muted)]">Datum</label>
                  <input
                    className="fo-input"
                    style={{ fontSize: 13, padding: '6px 8px' }}
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                  />
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <label className="text-[10px] font-medium text-[var(--fo-muted)]">Händler</label>
                  <input
                    className="fo-input"
                    style={{ fontSize: 13, padding: '6px 8px' }}
                    value={vendor}
                    onChange={e => setVendor(e.target.value)}
                    placeholder="z.B. REWE, EDEKA"
                  />
                </div>
                <div className="fo-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      gap: 4,
                      color: 'var(--fo-muted)',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    onClick={() => setIsEditing(false)}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      gap: 4,
                      color: '#34d399',
                      backgroundColor: 'rgba(52,211,153,0.08)',
                      border: '1px solid rgba(52,211,153,0.15)',
                    }}
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Speichern
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="fo-space-between">
                  <span className="text-xs text-[var(--fo-muted)]">Betrag</span>
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: '#f87171', fontVariantNumeric: 'tabular-nums' }}
                  >
                    {receipt.extracted_amount != null
                      ? formatEur(receipt.extracted_amount)
                      : '—'}
                  </span>
                </div>
                <div className="fo-space-between">
                  <span className="text-xs text-[var(--fo-muted)]">Datum</span>
                  <span className="text-sm text-[var(--fo-text)]">
                    {receipt.extracted_date ? formatDate(receipt.extracted_date) : '—'}
                  </span>
                </div>
                <div className="fo-space-between">
                  <span className="text-xs text-[var(--fo-muted)]">Händler</span>
                  <span className="text-sm text-[var(--fo-text)]">
                    {receipt.extracted_vendor ?? '—'}
                  </span>
                </div>

                {/* Extracted items */}
                {receipt.extracted_items && receipt.extracted_items.length > 0 && (
                  <div style={{ display: 'grid', gap: 4 }}>
                    <span className="text-[10px] font-medium text-[var(--fo-muted)]">
                      Einzelposten ({receipt.extracted_items.length})
                    </span>
                    <div
                      style={{
                        display: 'grid',
                        gap: 2,
                        maxHeight: 120,
                        overflow: 'auto',
                      }}
                    >
                      {receipt.extracted_items.map((item, i) => (
                        <div
                          key={i}
                          className="fo-space-between text-[11px]"
                          style={{ padding: '2px 0' }}
                        >
                          <span className="text-[var(--fo-muted)] truncate" style={{ maxWidth: 140 }}>
                            {item.name}
                          </span>
                          <span className="tabular-nums text-[var(--fo-text)]">
                            {formatEur(item.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="fo-row" style={{ justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                    style={{
                      gap: 4,
                      color: 'var(--fo-muted)',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil size={12} />
                    Bearbeiten
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
