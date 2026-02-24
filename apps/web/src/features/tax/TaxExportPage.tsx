import { useState } from 'react';

import {
  Calculator,
  Download,
  FileSpreadsheet,
  Receipt,
  Settings2,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { formatEurCents } from '@/core/utils/format';

import { EuerForm } from './EuerForm';
import { exportEuerCsv, exportEuerPdf, exportUstCsv } from './tax-export-utils';
import { TaxCategoryMapping } from './TaxCategoryMapping';
import { UstForm } from './UstForm';
import { useTaxData } from './useTaxData';

// ── Types ─────────────────────────────────────────────────────────────────────

type TaxTab = 'euer' | 'ust' | 'zuordnung';

const TABS: { id: TaxTab; label: string; icon: typeof Receipt }[] = [
  { id: 'euer', label: 'EÜR', icon: Calculator },
  { id: 'ust', label: 'Umsatzsteuer', icon: FileSpreadsheet },
  { id: 'zuordnung', label: 'Zuordnung', icon: Settings2 },
];

// ── Year selector ─────────────────────────────────────────────────────────────

function YearSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (y: number) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <select
      className="text-sm bg-[var(--fo-bg)] border border-[var(--fo-border)] rounded px-3 py-1.5 text-[var(--fo-text)]"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
    >
      {years.map(y => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  year,
  einnahmen,
  ausgaben,
  gewinn,
}: {
  year: number;
  einnahmen: number;
  ausgaben: number;
  gewinn: number;
}) {
  const fmtEuro = formatEurCents;

  const positive = gewinn >= 0;

  return (
    <motion.div
      className="fo-panel"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="p-4">
        <div className="text-xs text-[var(--fo-muted)] mb-3">
          Zeitraum: 01.01.{year} – 31.12.{year}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}
        >
          <div>
            <div className="text-xs text-[var(--fo-muted)] mb-0.5">
              Betriebseinnahmen
            </div>
            <div
              className="text-lg font-semibold tabular-nums"
              style={{ color: 'var(--fo-green)' }}
            >
              {fmtEuro(einnahmen)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--fo-muted)] mb-0.5">
              Betriebsausgaben
            </div>
            <div
              className="text-lg font-semibold tabular-nums"
              style={{ color: 'var(--fo-red)' }}
            >
              {fmtEuro(ausgaben)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--fo-muted)] mb-0.5">
              {positive ? 'Gewinn' : 'Verlust'}
            </div>
            <div
              className="text-lg font-bold tabular-nums"
              style={{ color: positive ? 'var(--fo-green)' : 'var(--fo-red)' }}
            >
              {positive ? '+' : '−'}
              {fmtEuro(Math.abs(gewinn))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="fo-stack" style={{ gap: 16 }}>
      <div className="h-24 rounded-md bg-[var(--fo-bg)] animate-pulse" />
      <div className="h-48 rounded-md bg-[var(--fo-bg)] animate-pulse" />
      <div className="h-64 rounded-md bg-[var(--fo-bg)] animate-pulse" />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TaxExportPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<TaxTab>('euer');

  const { euer, ust, isLoading, error } = useTaxData(year);

  function handleExport() {
    if (activeTab === 'euer') {
      exportEuerCsv(euer);
    } else if (activeTab === 'ust') {
      exportUstCsv(ust);
    }
  }

  function handlePdf() {
    exportEuerPdf(euer);
  }

  return (
    <motion.div
      className="p-5 h-full overflow-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Page header */}
      <motion.header
        className="mb-5"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="fo-space-between">
          <div className="fo-row" style={{ gap: 12 }}>
            <Receipt size={18} className="text-[var(--fo-muted)]" />
            <h1 className="text-xl font-semibold tracking-tight m-0">
              Steuerexport
            </h1>
          </div>
          <div className="fo-row" style={{ gap: 8 }}>
            <YearSelector value={year} onChange={setYear} />
            {activeTab !== 'zuordnung' && (
              <>
                <button
                  type="button"
                  className="fo-btn fo-row text-sm"
                  style={{ gap: 6, padding: '6px 14px' }}
                  onClick={handleExport}
                  disabled={isLoading}
                >
                  <Download size={14} />
                  CSV
                </button>
                {activeTab === 'euer' && (
                  <button
                    type="button"
                    className="fo-btn fo-row text-sm"
                    style={{ gap: 6, padding: '6px 14px' }}
                    onClick={handlePdf}
                    disabled={isLoading}
                  >
                    <FileSpreadsheet size={14} />
                    PDF
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* Tab navigation */}
      <nav className="flex gap-1 mb-5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`fo-row px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-[rgba(255,255,255,0.08)] text-[var(--fo-text)]'
                  : 'text-[var(--fo-muted)] hover:text-[var(--fo-text)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Summary card — shown for EÜR and USt tabs */}
      {activeTab !== 'zuordnung' && (
        <div className="mb-5">
          <SummaryCard
            year={year}
            einnahmen={euer.total_einnahmen}
            ausgaben={euer.total_ausgaben}
            gewinn={euer.gewinn_verlust}
          />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="fo-panel p-4 mb-4 border-[rgba(220,38,38,0.4)]">
          <p className="text-sm text-[var(--fo-red)]">
            Fehler beim Laden der Steuerdaten: {error.message}
          </p>
        </div>
      )}

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {isLoading && activeTab !== 'zuordnung' ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <LoadingSkeleton />
          </motion.div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === 'euer' && <EuerForm data={euer} />}
            {activeTab === 'ust' && <UstForm data={ust} />}
            {activeTab === 'zuordnung' && <TaxCategoryMapping />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
