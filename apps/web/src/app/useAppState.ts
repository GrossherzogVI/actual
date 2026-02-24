import { useMemo } from 'react';

export function useAppState() {
  const paletteEntries = useMemo(
    () => [
      { id: 'open-finance', label: 'Finanzen öffnen', hint: 'G F' },
      { id: 'open-quick-add', label: 'Neue Transaktion (Quick Add)', hint: '⌘N' },
      { id: 'open-finance-dashboard', label: 'Finanz-Dashboard', hint: 'F D' },
      { id: 'open-finance-transactions', label: 'Transaktionen', hint: 'F T' },
      { id: 'open-finance-contracts', label: 'Verträge', hint: 'F V' },
      { id: 'open-finance-calendar', label: 'Zahlungskalender', hint: 'F K' },
      { id: 'open-finance-categories', label: 'Kategorien verwalten', hint: 'F C' },
      { id: 'open-finance-review', label: 'Prüfungen / Review Queue', hint: 'F R' },
      { id: 'open-finance-analytics', label: 'Analysen öffnen', hint: 'F A' },
      { id: 'open-finance-import', label: 'Import öffnen', hint: 'F I' },
      { id: 'open-finance-budget', label: 'Budget öffnen', hint: 'F B' },
      { id: 'open-finance-tax', label: 'Steuer / EÜR öffnen', hint: 'F S' },
      { id: 'open-finance-receipts', label: 'Belege / OCR öffnen', hint: 'F E' },
      { id: 'open-finance-sepa', label: 'SEPA-Zahlungen öffnen', hint: 'F P' },
    ],
    [],
  );

  return { paletteEntries };
}
