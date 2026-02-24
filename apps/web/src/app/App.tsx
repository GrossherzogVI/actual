import { useCallback, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

import { connect } from '../core/api/surreal-client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { FinancePage } from '../features/finance/FinancePage';
import { QuickAddOverlay } from '../features/quick-add';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useAppState } from './useAppState';

function ConnectionStatus() {
  const [dismissed, setDismissed] = useState(false);
  const { isError, refetch } = useQuery({
    queryKey: ['connection-health'],
    queryFn: async () => {
      const db = await connect();
      await db.query('RETURN true');
      return true;
    },
    retry: 2,
    retryDelay: 3000,
    refetchInterval: 30_000,
  });

  if (!isError || dismissed) return null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2.5 text-sm"
      style={{
        background: 'var(--fo-danger-bg, rgba(239,68,68,0.1))',
        borderBottom: '1px solid var(--fo-danger, #ef4444)',
        color: 'var(--fo-danger, #ef4444)',
      }}
    >
      <AlertCircle size={16} className="shrink-0" />
      <span className="flex-1">
        Datenbankverbindung fehlgeschlagen — Daten können nicht geladen werden.
      </span>
      <button
        type="button"
        onClick={() => void refetch()}
        className="fo-row gap-1 text-xs font-medium hover:underline shrink-0"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
      >
        <RefreshCw size={12} />
        Erneut versuchen
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 p-0.5 rounded hover:opacity-70"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
        aria-label="Banner schließen"
      >
        <X size={14} />
      </button>
    </div>
  );
}

const TAB_MAP: Record<string, string> = {
  'open-finance': 'dashboard',
  'open-finance-dashboard': 'dashboard',
  'open-finance-transactions': 'transactions',
  'open-finance-contracts': 'contracts',
  'open-finance-calendar': 'calendar',
  'open-finance-categories': 'categories',
  'open-finance-review': 'review',
  'open-finance-analytics': 'analytics',
  'open-finance-import': 'import',
  'open-finance-budget': 'budget',
  'open-finance-tax': 'tax',
  'open-finance-receipts': 'receipts',
  'open-finance-sepa': 'sepa',
};

export function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const { paletteEntries } = useAppState();

  const runCommand = useCallback((entryId: string) => {
    if (entryId === 'open-quick-add') { setQuickAddOpen(true); return; }

    const tab = TAB_MAP[entryId];
    if (tab) {
      window.dispatchEvent(new CustomEvent('finance-tab', { detail: tab }));
    }
  }, []);

  const handlePaletteSelection = useCallback((entry: { id: string; label: string }) => {
    setPaletteOpen(false);
    runCommand(entry.id);
  }, [runCommand]);

  return (
    <div className="fo-app-shell">
      <KeyboardShortcuts
        onTogglePalette={() => setPaletteOpen(prev => !prev)}
        onClosePalette={() => setPaletteOpen(false)}
        onToggleQuickAdd={() => setQuickAddOpen(prev => !prev)}
      />

      <header className="fo-topbar">
        <div>
          <h1>Finance OS</h1>
          <small>Personal Finance Command Center</small>
        </div>
      </header>

      <ConnectionStatus />

      <div style={{ flex: 1, minHeight: 0 }}>
        <ErrorBoundary zone="finance">
          <FinancePage />
        </ErrorBoundary>
      </div>

      <CommandPalette
        open={paletteOpen}
        entries={paletteEntries}
        onClose={() => setPaletteOpen(false)}
        onSelect={handlePaletteSelection}
      />

      <QuickAddOverlay
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSaved={() => {}}
      />
    </div>
  );
}
