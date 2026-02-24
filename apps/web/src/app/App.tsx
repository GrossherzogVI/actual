import { useCallback, useState } from 'react';

import { ErrorBoundary } from '../components/ErrorBoundary';
import { FinancePage } from '../features/finance/FinancePage';
import { QuickAddOverlay } from '../features/quick-add';
import { CommandPalette } from './CommandPalette';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useAppState } from './useAppState';

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
