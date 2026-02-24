import { AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

import type { ParsedRow } from './parsers/types';

const PREVIEW_LIMIT = 20;

const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

type Props = {
  rows: ParsedRow[];
  errors: string[];
};

export function CsvPreviewTable({ rows, errors }: Props) {
  const preview = rows.slice(0, PREVIEW_LIMIT);
  const hiddenCount = rows.length - preview.length;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Error banner */}
      {errors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            display: 'flex',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--fo-danger)', flexShrink: 0, marginTop: 1 }} />
          <div style={{ display: 'grid', gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fo-danger)' }}>
              {errors.length} Fehler beim Parsen
            </span>
            {errors.slice(0, 5).map((err, i) => (
              <span key={i} style={{ fontSize: 11, color: 'var(--fo-muted)' }}>
                {err}
              </span>
            ))}
            {errors.length > 5 && (
              <span style={{ fontSize: 11, color: 'var(--fo-muted)' }}>
                … und {errors.length - 5} weitere
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Stats row */}
      <div
        className="fo-row"
        style={{ justifyContent: 'space-between', fontSize: 12, color: 'var(--fo-muted)' }}
      >
        <span>
          <strong style={{ color: 'var(--fo-text)' }}>{rows.length}</strong> Transaktionen erkannt
        </span>
        {preview.length < rows.length && (
          <span>Vorschau: erste {preview.length} von {rows.length}</span>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--fo-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--fo-bg)' }}>
              {(['Datum', 'Betrag', 'Empfänger/Auftraggeber', 'Verwendungszweck'] as const).map(
                col => (
                  <th
                    key={col}
                    style={{
                      padding: '8px 12px',
                      textAlign: col === 'Betrag' ? 'right' : 'left',
                      fontWeight: 600,
                      color: 'var(--fo-muted)',
                      borderBottom: '1px solid var(--fo-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, i) => {
              const isExpense = row.amount < 0;
              return (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.1, delay: i * 0.015 }}
                  style={{
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    borderBottom:
                      i < preview.length - 1 ? '1px solid var(--fo-border)' : 'none',
                  }}
                >
                  <td
                    style={{
                      padding: '7px 12px',
                      color: 'var(--fo-muted)',
                      whiteSpace: 'nowrap',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {row.date}
                  </td>
                  <td
                    style={{
                      padding: '7px 12px',
                      textAlign: 'right',
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                      color: isExpense ? 'var(--fo-danger)' : 'var(--fo-ok)',
                    }}
                  >
                    {fmt.format(row.amount)}
                  </td>
                  <td
                    style={{
                      padding: '7px 12px',
                      color: 'var(--fo-text)',
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.payee || <span style={{ color: 'var(--fo-muted)' }}>—</span>}
                  </td>
                  <td
                    style={{
                      padding: '7px 12px',
                      color: 'var(--fo-muted)',
                      maxWidth: 260,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.notes || '—'}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 && (
        <p style={{ fontSize: 11, color: 'var(--fo-muted)', textAlign: 'center' }}>
          … und {hiddenCount} weitere Transaktionen (nicht angezeigt)
        </p>
      )}
    </div>
  );
}
