import { FileText, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';

import type { SpendingPattern } from '../../core/types/finance';
import { ConfidenceBadge } from './ConfidenceBadge';

const TYPE_LABELS: Record<SpendingPattern['type'], string> = {
  recurring_untracked: 'Wiederkehrend (nicht erfasst)',
  seasonal: 'Saisonal',
  increasing: 'Steigend',
  decreasing: 'Sinkend',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function SpendingPatternCard({
  pattern,
  onDismiss,
  isDismissing,
}: {
  pattern: SpendingPattern;
  onDismiss: (id: string) => void;
  isDismissing: boolean;
}) {
  const typeLabel = TYPE_LABELS[pattern.type];

  return (
    <motion.div
      layout
      className="fo-card"
      style={{ display: 'grid', gap: 10 }}
      exit={{
        opacity: 0,
        height: 0,
        marginTop: 0,
        marginBottom: 0,
        overflow: 'hidden',
      }}
      transition={{ duration: 0.2 }}
    >
      {/* Header: type badge + confidence */}
      <div className="fo-space-between">
        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[rgba(255,255,255,0.06)] text-[var(--fo-muted)]">
          {typeLabel}
        </span>
        <ConfidenceBadge confidence={pattern.confidence} showPercentage />
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--fo-text)]" style={{ margin: 0 }}>
        {pattern.description}
      </p>

      {/* Details: payee, amount, frequency */}
      {(pattern.payee_name || pattern.amount != null || pattern.frequency) && (
        <div
          className="fo-row text-[11px] text-[var(--fo-muted)]"
          style={{ gap: 12, flexWrap: 'wrap' }}
        >
          {pattern.payee_name && <span>{pattern.payee_name}</span>}
          {pattern.amount != null && pattern.frequency && (
            <span
              className="tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              ~{formatCurrency(pattern.amount)} / {pattern.frequency}
            </span>
          )}
          {pattern.amount != null && !pattern.frequency && (
            <span
              className="tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              ~{formatCurrency(pattern.amount)}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {!pattern.dismissed && (
        <div className="fo-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          {pattern.type === 'recurring_untracked' && (
            <button
              type="button"
              className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                gap: 4,
                color: 'var(--fo-info)',
                backgroundColor: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.15)',
              }}
              onClick={() => {
                /* Placeholder: navigate to contract creation */
              }}
            >
              <FileText size={12} />
              Als Vertrag erfassen
            </button>
          )}

          <button
            type="button"
            className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              gap: 4,
              color: 'var(--fo-muted)',
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={() => onDismiss(pattern.id)}
            disabled={isDismissing}
          >
            {isDismissing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <X size={12} />
            )}
            {isDismissing ? 'Wird verworfen...' : 'Verwerfen'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
