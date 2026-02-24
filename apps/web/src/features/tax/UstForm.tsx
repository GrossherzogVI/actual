import { formatEurCents } from '@/core/utils/format';

import type { UstData, VatGroup } from './types';

// ── Number formatting ─────────────────────────────────────────────────────────

const fmtEuro = formatEurCents;

// ── Sub-components ────────────────────────────────────────────────────────────

function VatRateCard({ group }: { group: VatGroup }) {
  return (
    <div className="fo-panel">
      <div className="fo-panel-header">
        <h3 className="text-sm font-semibold">{group.label}</h3>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1,
          background: 'var(--fo-border)',
        }}
      >
        {/* Income side */}
        <div className="bg-[var(--fo-surface)] p-3">
          <div className="text-xs text-[var(--fo-muted)] mb-2">
            Umsatzsteuer (Einnahmen)
          </div>
          <div className="fo-stack" style={{ gap: 6 }}>
            <div className="fo-space-between text-xs">
              <span className="text-[var(--fo-muted)]">Netto</span>
              <span className="tabular-nums">{fmtEuro(group.income_netto)}</span>
            </div>
            <div className="fo-space-between text-xs">
              <span className="text-[var(--fo-muted)]">USt ({group.rate}%)</span>
              <span
                className="tabular-nums font-medium"
                style={{ color: 'var(--fo-red)' }}
              >
                {fmtEuro(group.income_ust)}
              </span>
            </div>
            <div className="fo-space-between text-xs border-t border-[var(--fo-border)] pt-1">
              <span className="text-[var(--fo-muted)]">Brutto</span>
              <span className="tabular-nums">{fmtEuro(group.income_brutto)}</span>
            </div>
          </div>
        </div>

        {/* Expense side */}
        <div className="bg-[var(--fo-surface)] p-3">
          <div className="text-xs text-[var(--fo-muted)] mb-2">
            Vorsteuer (Ausgaben)
          </div>
          <div className="fo-stack" style={{ gap: 6 }}>
            <div className="fo-space-between text-xs">
              <span className="text-[var(--fo-muted)]">Netto</span>
              <span className="tabular-nums">{fmtEuro(group.expense_netto)}</span>
            </div>
            <div className="fo-space-between text-xs">
              <span className="text-[var(--fo-muted)]">
                Vorsteuer ({group.rate}%)
              </span>
              <span
                className="tabular-nums font-medium"
                style={{ color: 'var(--fo-green)' }}
              >
                {fmtEuro(group.expense_vorsteuer)}
              </span>
            </div>
            <div className="fo-space-between text-xs border-t border-[var(--fo-border)] pt-1">
              <span className="text-[var(--fo-muted)]">Brutto</span>
              <span className="tabular-nums">{fmtEuro(group.expense_brutto)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuarterlyTable({ data }: { data: UstData }) {
  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h3 className="text-sm font-semibold">Quartalszahlen</h3>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--fo-border)] text-[var(--fo-muted)] text-xs">
            <th className="text-left px-4 py-2 font-medium">Quartal</th>
            <th className="text-right px-4 py-2 font-medium">Umsatzsteuer</th>
            <th className="text-right px-4 py-2 font-medium">Vorsteuer</th>
            <th className="text-right px-4 py-2 font-medium">Zahllast</th>
          </tr>
        </thead>
        <tbody>
          {data.quarterly.map(q => {
            const positive = q.zahllast >= 0;
            return (
              <tr
                key={q.quarter}
                className="border-b border-[var(--fo-border)] last:border-0"
              >
                <td className="px-4 py-2 font-medium">{q.quarter}</td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--fo-red)]">
                  {q.umsatzsteuer > 0 ? fmtEuro(q.umsatzsteuer) : <span className="text-[var(--fo-muted)]">—</span>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[var(--fo-green)]">
                  {q.vorsteuer > 0 ? fmtEuro(q.vorsteuer) : <span className="text-[var(--fo-muted)]">—</span>}
                </td>
                <td
                  className="px-4 py-2 text-right tabular-nums font-semibold"
                  style={{
                    color: positive ? 'var(--fo-red)' : 'var(--fo-green)',
                  }}
                >
                  {q.zahllast !== 0 ? (
                    `${positive ? '' : '−'}${fmtEuro(Math.abs(q.zahllast))}`
                  ) : (
                    <span className="text-[var(--fo-muted)]">0,00 €</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = { data: UstData };

export function UstForm({ data }: Props) {
  const zahllastPositive = data.zahllast >= 0;

  if (data.groups.length === 0) {
    return (
      <div className="fo-card text-center py-12">
        <p className="text-sm text-[var(--fo-muted)]">
          Keine steuerlich relevanten Transaktionen für dieses Jahr gefunden.
        </p>
        <p className="text-xs text-[var(--fo-muted)] mt-1">
          Konfiguriere die Kategorie-Zuordnung unter dem Tab „Zuordnung".
        </p>
      </div>
    );
  }

  return (
    <div className="fo-stack" style={{ gap: 16 }}>
      {/* VAT rate cards */}
      {data.groups.map(group => (
        <VatRateCard key={group.rate} group={group} />
      ))}

      {/* Quarterly table */}
      <QuarterlyTable data={data} />

      {/* Summary: Zahllast */}
      <div className="fo-panel">
        <div className="fo-space-between p-4">
          <div>
            <div className="text-xs text-[var(--fo-muted)] mb-0.5">
              Umsatzsteuer-Voranmeldung
            </div>
            <div className="text-base font-semibold">
              {zahllastPositive ? 'Zahllast (zu zahlen)' : 'Erstattung'}
            </div>
            <div className="text-xs text-[var(--fo-muted)] mt-1">
              USt {fmtEuro(data.total_umsatzsteuer)} − Vorsteuer{' '}
              {fmtEuro(data.total_vorsteuer)}
            </div>
          </div>
          <div
            className="text-2xl font-bold tabular-nums"
            style={{
              color: zahllastPositive ? 'var(--fo-red)' : 'var(--fo-green)',
            }}
          >
            {zahllastPositive ? '' : '+'}
            {fmtEuro(Math.abs(data.zahllast))}
          </div>
        </div>
      </div>
    </div>
  );
}
