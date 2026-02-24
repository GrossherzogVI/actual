import { Check, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

import type { Anomaly } from '../../core/types/finance';

const TYPE_LABELS: Record<Anomaly['type'], string> = {
  unusual_amount: 'Ungewoehnlicher Betrag',
  new_payee: 'Neuer Empfaenger',
  frequency_change: 'Haeufigkeitsaenderung',
  category_drift: 'Kategorieverschiebung',
};

const SEVERITY_CONFIG: Record<
  Anomaly['severity'],
  { color: string; bg: string; label: string }
> = {
  low: { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Niedrig' },
  medium: { color: '#eab308', bg: 'rgba(234,179,8,0.12)', label: 'Mittel' },
  high: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Hoch' },
};

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function AnomalyCard({
  anomaly,
  onResolve,
  isResolving,
}: {
  anomaly: Anomaly;
  onResolve: (id: string) => void;
  isResolving: boolean;
}) {
  const severity = SEVERITY_CONFIG[anomaly.severity];
  const typeLabel = TYPE_LABELS[anomaly.type];

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
      {/* Header: badges + date */}
      <div className="fo-space-between">
        <div className="fo-row" style={{ gap: 6 }}>
          {/* Severity badge */}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{ color: severity.color, backgroundColor: severity.bg }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: severity.color }}
            />
            {severity.label}
          </span>

          {/* Type badge */}
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[rgba(255,255,255,0.06)] text-[var(--fo-muted)]">
            {typeLabel}
          </span>
        </div>

        <span className="text-[10px] text-[var(--fo-muted)]">
          {formatDate(anomaly.created_at)}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--fo-text)]" style={{ margin: 0 }}>
        {anomaly.description}
      </p>

      {/* Explanation (if available) */}
      {anomaly.explanation && (
        <div
          className="rounded-md px-3 py-2 text-xs"
          style={{
            backgroundColor: 'rgba(139,92,246,0.06)',
            border: '1px solid rgba(139,92,246,0.12)',
            color: 'var(--fo-text)',
            lineHeight: 1.5,
          }}
        >
          <span
            className="text-[10px] font-medium"
            style={{ color: 'var(--fo-accent)' }}
          >
            Erklaerung
          </span>
          <p style={{ margin: '4px 0 0' }}>{anomaly.explanation}</p>
        </div>
      )}

      {/* Actions */}
      {!anomaly.resolved && (
        <div className="fo-row" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              gap: 4,
              color: '#34d399',
              backgroundColor: 'rgba(52,211,153,0.08)',
              border: '1px solid rgba(52,211,153,0.15)',
            }}
            onClick={() => onResolve(anomaly.id)}
            disabled={isResolving}
          >
            {isResolving ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} />
            )}
            {isResolving ? 'Wird erledigt...' : 'Erledigt'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
