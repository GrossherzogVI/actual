import { Check, Link, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

import { formatDate, formatEur } from '@/core/utils/format';

import type { MatchCandidate } from './types';

type Props = {
  candidates: MatchCandidate[];
  onLink: (transactionId: string) => void;
  linkedId?: string;
  isLinking?: boolean;
};

export function OcrMatchSuggestion({ candidates, onLink, linkedId, isLinking }: Props) {
  if (candidates.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="fo-row text-[11px] text-[var(--fo-muted)]" style={{ gap: 4 }}>
        <Link size={11} />
        <span>Passende Transaktionen ({candidates.length})</span>
      </div>

      {candidates.map(candidate => {
        const isLinked = linkedId === candidate.id;

        return (
          <motion.div
            key={candidate.id}
            layout
            className="fo-card"
            style={{
              display: 'grid',
              gap: 8,
              borderColor: isLinked ? 'rgba(52,211,153,0.3)' : undefined,
              backgroundColor: isLinked ? 'rgba(52,211,153,0.04)' : undefined,
            }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: 0.2 }}
          >
            <div className="fo-space-between">
              <div style={{ display: 'grid', gap: 2 }}>
                <span className="text-sm font-medium text-[var(--fo-text)]">
                  {candidate.payee_name ?? 'Unbekannt'}
                </span>
                <span className="text-[11px] text-[var(--fo-muted)]">
                  {formatDate(candidate.date)}
                  {candidate.notes && (
                    <span className="truncate" style={{ maxWidth: 160, marginLeft: 6 }}>
                      · {candidate.notes}
                    </span>
                  )}
                </span>
              </div>

              <span
                className="text-sm font-semibold tabular-nums"
                style={{
                  color: candidate.amount < 0 ? '#f87171' : '#34d399',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatEur(candidate.amount)}
              </span>
            </div>

            <div className="fo-row" style={{ justifyContent: 'flex-end' }}>
              {isLinked ? (
                <span
                  className="fo-row rounded-md px-3 py-1.5 text-xs font-medium"
                  style={{ gap: 4, color: '#34d399' }}
                >
                  <Check size={12} />
                  Verknüpft
                </span>
              ) : (
                <button
                  type="button"
                  className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    gap: 4,
                    color: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    border: '1px solid rgba(59,130,246,0.15)',
                  }}
                  onClick={() => onLink(candidate.id)}
                  disabled={isLinking}
                >
                  {isLinking ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Link size={12} />
                  )}
                  Verknüpfen
                </button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
