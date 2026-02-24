import { useState } from 'react';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { formatDate, formatEurCents } from '@/core/utils/format';

import {
  EUER_AUSGABEN_ORDER,
  EUER_EINNAHMEN_ORDER,
  EUER_LINE_LABELS,
} from './tax-category-map';
import type { EuerData, EuerLine, EuerLineTotal, TaxTransaction } from './types';

// ── Number formatting ─────────────────────────────────────────────────────────

function fmtEuro(cents: number, showSign = false): string {
  const formatted = formatEurCents(cents);
  if (showSign && cents < 0) return `−${formatted}`;
  return formatted;
}

function fmtDate(dateStr: string): string {
  return formatDate(dateStr);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TransactionList({ transactions }: { transactions: TaxTransaction[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      style={{ overflow: 'hidden' }}
    >
      <div className="mt-2 mx-4 mb-3 rounded-md border border-[var(--fo-border)] overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[var(--fo-bg)] border-b border-[var(--fo-border)]">
              <th className="text-left px-3 py-1.5 text-[var(--fo-muted)] font-medium">
                Datum
              </th>
              <th className="text-left px-3 py-1.5 text-[var(--fo-muted)] font-medium">
                Empfänger
              </th>
              <th className="text-left px-3 py-1.5 text-[var(--fo-muted)] font-medium">
                Notiz
              </th>
              <th className="text-right px-3 py-1.5 text-[var(--fo-muted)] font-medium">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr
                key={tx.id}
                className="border-b border-[var(--fo-border)] last:border-0 hover:bg-[rgba(255,255,255,0.02)]"
              >
                <td className="px-3 py-1.5 text-[var(--fo-muted)]">
                  {fmtDate(tx.date)}
                </td>
                <td className="px-3 py-1.5">{tx.payee_name ?? '—'}</td>
                <td className="px-3 py-1.5 text-[var(--fo-muted)] truncate max-w-[200px]">
                  {tx.notes ?? ''}
                </td>
                <td
                  className="px-3 py-1.5 text-right tabular-nums"
                  style={{ color: tx.amount >= 0 ? 'var(--fo-green)' : 'var(--fo-red)' }}
                >
                  {fmtEuro(Math.abs(tx.amount))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function EuerLineRow({
  lineTotal,
  expanded,
  onToggle,
}: {
  lineTotal: EuerLineTotal | null;
  line: EuerLine;
  expanded: boolean;
  onToggle: () => void;
}) {
  const total = lineTotal?.total ?? 0;
  const count = lineTotal?.count ?? 0;
  const hasTransactions = count > 0;

  return (
    <>
      <tr
        className={`border-b border-[var(--fo-border)] transition-colors ${
          hasTransactions
            ? 'cursor-pointer hover:bg-[rgba(255,255,255,0.02)]'
            : ''
        }`}
        onClick={hasTransactions ? onToggle : undefined}
      >
        <td className="px-4 py-2 flex items-center gap-2">
          {hasTransactions ? (
            expanded ? (
              <ChevronDown size={12} className="text-[var(--fo-muted)] flex-shrink-0" />
            ) : (
              <ChevronRight size={12} className="text-[var(--fo-muted)] flex-shrink-0" />
            )
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <span className={total === 0 ? 'text-[var(--fo-muted)]' : ''}>
            {lineTotal?.label}
          </span>
        </td>
        <td className="px-4 py-2 text-right tabular-nums">
          {total > 0 ? fmtEuro(total) : <span className="text-[var(--fo-muted)]">—</span>}
        </td>
        <td className="px-4 py-2 text-right text-[var(--fo-muted)]">
          {count > 0 ? count : ''}
        </td>
      </tr>
      {hasTransactions && (
        <tr>
          <td colSpan={3} className="p-0">
            <AnimatePresence>
              {expanded && (
                <TransactionList transactions={lineTotal!.transactions} />
              )}
            </AnimatePresence>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = { data: EuerData };

export function EuerForm({ data }: Props) {
  const [expanded, setExpanded] = useState<Set<EuerLine>>(new Set());

  function toggleLine(line: EuerLine) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }

  const lineMap = new Map(data.lines.map(l => [l.line, l]));

  const gewinnPositive = data.gewinn_verlust >= 0;

  return (
    <div className="fo-stack" style={{ gap: 16 }}>
      {/* Betriebseinnahmen */}
      <section className="fo-panel">
        <header className="fo-panel-header">
          <div className="fo-space-between">
            <h3 className="text-sm font-semibold">Betriebseinnahmen</h3>
            <span className="tabular-nums text-sm font-semibold text-[var(--fo-green)]">
              {fmtEuro(data.total_einnahmen)}
            </span>
          </div>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--fo-border)] text-[var(--fo-muted)] text-xs">
              <th className="text-left px-4 py-2 font-medium">Position</th>
              <th className="text-right px-4 py-2 font-medium">Betrag</th>
              <th className="text-right px-4 py-2 font-medium">Buchungen</th>
            </tr>
          </thead>
          <tbody>
            {EUER_EINNAHMEN_ORDER.map(line => (
              <EuerLineRow
                key={line}
                line={line}
                lineTotal={
                  lineMap.has(line)
                    ? lineMap.get(line)!
                    : { line, label: EUER_LINE_LABELS[line], group: 'einnahmen', total: 0, count: 0, transactions: [] }
                }
                expanded={expanded.has(line)}
                onToggle={() => toggleLine(line)}
              />
            ))}
          </tbody>
        </table>
      </section>

      {/* Betriebsausgaben */}
      <section className="fo-panel">
        <header className="fo-panel-header">
          <div className="fo-space-between">
            <h3 className="text-sm font-semibold">Betriebsausgaben</h3>
            <span className="tabular-nums text-sm font-semibold text-[var(--fo-red)]">
              {fmtEuro(data.total_ausgaben)}
            </span>
          </div>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--fo-border)] text-[var(--fo-muted)] text-xs">
              <th className="text-left px-4 py-2 font-medium">Position</th>
              <th className="text-right px-4 py-2 font-medium">Betrag</th>
              <th className="text-right px-4 py-2 font-medium">Buchungen</th>
            </tr>
          </thead>
          <tbody>
            {EUER_AUSGABEN_ORDER.map(line => (
              <EuerLineRow
                key={line}
                line={line}
                lineTotal={
                  lineMap.has(line)
                    ? lineMap.get(line)!
                    : { line, label: EUER_LINE_LABELS[line], group: 'ausgaben', total: 0, count: 0, transactions: [] }
                }
                expanded={expanded.has(line)}
                onToggle={() => toggleLine(line)}
              />
            ))}
          </tbody>
        </table>
      </section>

      {/* Ergebnis */}
      <div
        className="fo-panel"
        style={{
          borderColor: gewinnPositive
            ? 'rgba(22, 163, 74, 0.3)'
            : 'rgba(220, 38, 38, 0.3)',
        }}
      >
        <div className="fo-space-between p-4">
          <div>
            <div className="text-xs text-[var(--fo-muted)] mb-0.5">Ergebnis</div>
            <div className="text-base font-semibold">
              {gewinnPositive ? 'Gewinn' : 'Verlust'}
            </div>
          </div>
          <div
            className="text-2xl font-bold tabular-nums"
            style={{ color: gewinnPositive ? 'var(--fo-green)' : 'var(--fo-red)' }}
          >
            {gewinnPositive ? '+' : '−'}
            {fmtEuro(Math.abs(data.gewinn_verlust))}
          </div>
        </div>
      </div>
    </div>
  );
}
