import { useState } from 'react';

import { AlertTriangle, SkipForward, PlusCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import type { Transaction } from '../../core/types/finance';
import type { ParsedRow } from './parsers/types';

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

type DuplicatePair = {
  row: ParsedRow;
  duplicateOf?: Transaction;
};

type Props = {
  duplicates: DuplicatePair[];
  onResolve: (kept: ParsedRow[]) => void;
};

export function DuplicateResolver({ duplicates, onResolve }: Props) {
  // Track which rows the user wants to keep (import anyway)
  const [kept, setKept] = useState<Set<number>>(new Set());

  function toggleKeep(index: number) {
    setKept(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function skipAll() {
    setKept(new Set());
    onResolve([]);
  }

  function confirmSelection() {
    const keptRows = duplicates
      .filter((_, i) => kept.has(i))
      .map(d => d.row);
    onResolve(keptRows);
  }

  const actualDuplicates = duplicates.filter(d => d.duplicateOf !== undefined);
  const skipCount = actualDuplicates.length - kept.size;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '10px 14px',
          borderRadius: 8,
          backgroundColor: 'rgba(251,191,36,0.08)',
          border: '1px solid rgba(251,191,36,0.2)',
        }}
      >
        <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#fbbf24', margin: 0 }}>
            {actualDuplicates.length} mögliche Duplikat
            {actualDuplicates.length !== 1 ? 'e' : ''} gefunden
          </p>
          <p style={{ fontSize: 12, color: 'var(--fo-muted)', margin: '3px 0 0' }}>
            Diese Transaktionen existieren möglicherweise bereits. Wähle, was importiert werden
            soll.
          </p>
        </div>
      </div>

      {/* Duplicate list */}
      <div style={{ display: 'grid', gap: 8 }}>
        <AnimatePresence>
          {actualDuplicates.map((pair, i) => {
            const isKept = kept.has(i);
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: i * 0.04 }}
                className="fo-card"
                style={{
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 10,
                  border: isKept
                    ? '1px solid var(--fo-accent)'
                    : '1px solid var(--fo-border)',
                }}
              >
                {/* Imported row */}
                <div style={{ display: 'grid', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'var(--fo-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Neu (zu importieren)
                  </span>
                  <div className="fo-row" style={{ justifyContent: 'space-between', gap: 8 }}>
                    <div className="fo-row" style={{ gap: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--fo-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {pair.row.date}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--fo-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pair.row.payee || '—'}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                        color: pair.row.amount < 0 ? 'var(--fo-danger)' : 'var(--fo-ok)',
                      }}
                    >
                      {fmt.format(pair.row.amount)}
                    </span>
                  </div>
                  {pair.row.notes && (
                    <span style={{ fontSize: 11, color: 'var(--fo-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pair.row.notes}
                    </span>
                  )}
                </div>

                {/* Existing transaction */}
                {pair.duplicateOf && (
                  <div
                    style={{
                      display: 'grid',
                      gap: 2,
                      paddingTop: 8,
                      borderTop: '1px solid var(--fo-border)',
                    }}
                  >
                    <span style={{ fontSize: 10, color: 'var(--fo-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Vorhanden (Duplikat)
                    </span>
                    <div className="fo-row" style={{ justifyContent: 'space-between', gap: 8 }}>
                      <div className="fo-row" style={{ gap: 10 }}>
                        <span style={{ fontSize: 12, color: 'var(--fo-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {pair.duplicateOf.date}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--fo-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pair.duplicateOf.payee_name || pair.duplicateOf.payee || '—'}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: 13,
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                          color: 'var(--fo-muted)',
                        }}
                      >
                        {fmt.format(pair.duplicateOf.amount)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="fo-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="fo-btn fo-row"
                    onClick={() => {
                      // Force skip: ensure this index is NOT in kept
                      setKept(prev => {
                        const next = new Set(prev);
                        next.delete(i);
                        return next;
                      });
                    }}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      gap: 5,
                      opacity: isKept ? 1 : 0.5,
                      backgroundColor: isKept ? 'transparent' : 'rgba(239,68,68,0.08)',
                      color: isKept ? 'var(--fo-muted)' : 'var(--fo-danger)',
                      border: '1px solid',
                      borderColor: isKept ? 'var(--fo-border)' : 'rgba(239,68,68,0.3)',
                    }}
                  >
                    <SkipForward size={12} />
                    Überspringen
                  </button>
                  <button
                    type="button"
                    className="fo-btn fo-row"
                    onClick={() => toggleKeep(i)}
                    style={{
                      fontSize: 11,
                      padding: '4px 10px',
                      gap: 5,
                      backgroundColor: isKept ? 'rgba(99,102,241,0.12)' : 'transparent',
                      color: isKept ? 'var(--fo-accent)' : 'var(--fo-muted)',
                      border: '1px solid',
                      borderColor: isKept ? 'var(--fo-accent)' : 'var(--fo-border)',
                    }}
                  >
                    <PlusCircle size={12} />
                    Trotzdem importieren
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Batch action bar */}
      <div
        className="fo-row"
        style={{ justifyContent: 'space-between', paddingTop: 8, gap: 10 }}
      >
        <button
          type="button"
          className="fo-btn fo-row"
          onClick={skipAll}
          style={{ fontSize: 12, padding: '6px 14px', gap: 6, color: 'var(--fo-muted)' }}
        >
          <SkipForward size={13} />
          Alle Duplikate überspringen
        </button>

        <button
          type="button"
          className="fo-btn fo-row"
          onClick={confirmSelection}
          style={{
            fontSize: 12,
            padding: '6px 14px',
            gap: 6,
            backgroundColor: 'var(--fo-accent)',
            color: '#fff',
            border: 'none',
          }}
        >
          Bestätigen
          {skipCount > 0 && (
            <span
              style={{
                fontSize: 10,
                padding: '1px 6px',
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.2)',
              }}
            >
              {skipCount} übersprungen
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
