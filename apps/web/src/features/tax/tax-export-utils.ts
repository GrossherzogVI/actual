import { escapeHtml, formatEurCents } from '@/core/utils/format';

import type { EuerData, UstData } from './types';
import { EUER_AUSGABEN_ORDER, EUER_EINNAHMEN_ORDER, EUER_LINE_LABELS } from './tax-category-map';

// ── Number formatting ─────────────────────────────────────────────────────────

/** Format cents as German euro string: "1.234,56 €" */
const fmtEuro = formatEurCents;

/** Format cents as plain decimal for CSV: "1234.56" */
function fmtDecimalCsv(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// ── EÜR CSV Export ────────────────────────────────────────────────────────────

export function exportEuerCsv(data: EuerData): void {
  const rows: string[][] = [];

  // Header
  rows.push([
    `Einnahmen-Überschuss-Rechnung ${data.year}`,
    '',
    '',
  ]);
  rows.push(['Position', 'Betrag (EUR)', 'Anzahl Buchungen']);
  rows.push([]);

  // Betriebseinnahmen section
  rows.push(['BETRIEBSEINNAHMEN', '', '']);
  for (const line of EUER_EINNAHMEN_ORDER) {
    const found = data.lines.find(l => l.line === line);
    rows.push([
      EUER_LINE_LABELS[line],
      found ? fmtDecimalCsv(found.total) : '0,00',
      found ? String(found.count) : '0',
    ]);
  }
  rows.push([
    'Summe Betriebseinnahmen',
    fmtDecimalCsv(data.total_einnahmen),
    '',
  ]);
  rows.push([]);

  // Betriebsausgaben section
  rows.push(['BETRIEBSAUSGABEN', '', '']);
  for (const line of EUER_AUSGABEN_ORDER) {
    const found = data.lines.find(l => l.line === line);
    rows.push([
      EUER_LINE_LABELS[line],
      found ? fmtDecimalCsv(found.total) : '0,00',
      found ? String(found.count) : '0',
    ]);
  }
  rows.push([
    'Summe Betriebsausgaben',
    fmtDecimalCsv(data.total_ausgaben),
    '',
  ]);
  rows.push([]);

  // Ergebnis
  rows.push(['ERGEBNIS', '', '']);
  rows.push([
    data.gewinn_verlust >= 0 ? 'Gewinn' : 'Verlust',
    fmtDecimalCsv(Math.abs(data.gewinn_verlust)),
    '',
  ]);

  // Render as semicolon-separated CSV (German convention)
  const csv = rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  downloadText(
    `EUeR_${data.year}.csv`,
    csv,
    'text/csv;charset=utf-8',
    // Prepend BOM for Excel compatibility
    '\uFEFF',
  );
}

// ── USt CSV Export ────────────────────────────────────────────────────────────

export function exportUstCsv(data: UstData): void {
  const rows: string[][] = [];

  rows.push([`Umsatzsteuer-Voranmeldung ${data.year}`, '', '', '', '', '']);
  rows.push([
    'Steuersatz',
    'Nettobetrag Einnahmen (EUR)',
    'USt Einnahmen (EUR)',
    'Nettobetrag Ausgaben (EUR)',
    'Vorsteuer Ausgaben (EUR)',
    'Anzahl',
  ]);

  for (const g of data.groups) {
    rows.push([
      `${g.rate}%`,
      fmtDecimalCsv(g.income_netto),
      fmtDecimalCsv(g.income_ust),
      fmtDecimalCsv(g.expense_netto),
      fmtDecimalCsv(g.expense_vorsteuer),
      String(g.count),
    ]);
  }

  rows.push([]);
  rows.push(['QUARTALSZAHLEN', '', '', '', '', '']);
  rows.push([
    'Quartal',
    '',
    'Umsatzsteuer (EUR)',
    '',
    'Vorsteuer (EUR)',
    'Zahllast (EUR)',
  ]);
  for (const q of data.quarterly) {
    rows.push([
      q.quarter,
      '',
      fmtDecimalCsv(q.umsatzsteuer),
      '',
      fmtDecimalCsv(q.vorsteuer),
      fmtDecimalCsv(q.zahllast),
    ]);
  }

  rows.push([]);
  rows.push([
    'Gesamte Umsatzsteuer',
    '',
    fmtDecimalCsv(data.total_umsatzsteuer),
    '',
    '',
    '',
  ]);
  rows.push([
    'Gesamte Vorsteuer',
    '',
    '',
    '',
    fmtDecimalCsv(data.total_vorsteuer),
    '',
  ]);
  rows.push([
    'Zahllast gesamt',
    '',
    '',
    '',
    '',
    fmtDecimalCsv(data.zahllast),
  ]);

  const csv = rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\r\n');

  downloadText(
    `USt_Voranmeldung_${data.year}.csv`,
    csv,
    'text/csv;charset=utf-8',
    '\uFEFF',
  );
}

// ── EÜR PDF Export (print-to-PDF via browser) ────────────────────────────────

export function exportEuerPdf(data: EuerData): void {
  const yearStr = escapeHtml(String(data.year));

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>EÜR ${yearStr}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    .subtitle { color: #555; font-size: 11px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { background: #f0f0f0; text-align: left; padding: 6px 8px; border: 1px solid #ccc; }
    td { padding: 5px 8px; border: 1px solid #e0e0e0; }
    .section-header td { background: #e8e8e8; font-weight: bold; }
    .total-row td { font-weight: bold; border-top: 2px solid #999; }
    .result-row td { background: #f9f9f9; font-weight: bold; font-size: 13px; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    .positive { color: #16a34a; }
    .negative { color: #dc2626; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>Einnahmen-Überschuss-Rechnung</h1>
  <div class="subtitle">Steuerjahr ${yearStr} &nbsp;|&nbsp; Zeitraum: 01.01.${yearStr} – 31.12.${yearStr}</div>
  <table>
    <thead>
      <tr>
        <th>Position</th>
        <th class="amount">Betrag (€)</th>
        <th class="amount">Buchungen</th>
      </tr>
    </thead>
    <tbody>
      <tr class="section-header"><td colspan="3">Betriebseinnahmen</td></tr>
      ${EUER_EINNAHMEN_ORDER.map(line => {
        const found = data.lines.find(l => l.line === line);
        return `<tr>
          <td>${escapeHtml(EUER_LINE_LABELS[line])}</td>
          <td class="amount">${found ? escapeHtml(fmtEuro(found.total)) : '0,00 €'}</td>
          <td class="amount">${found ? escapeHtml(String(found.count)) : '0'}</td>
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td>Summe Betriebseinnahmen</td>
        <td class="amount">${escapeHtml(fmtEuro(data.total_einnahmen))}</td>
        <td></td>
      </tr>

      <tr class="section-header"><td colspan="3">Betriebsausgaben</td></tr>
      ${EUER_AUSGABEN_ORDER.map(line => {
        const found = data.lines.find(l => l.line === line);
        return `<tr>
          <td>${escapeHtml(EUER_LINE_LABELS[line])}</td>
          <td class="amount">${found ? escapeHtml(fmtEuro(found.total)) : '0,00 €'}</td>
          <td class="amount">${found ? escapeHtml(String(found.count)) : '0'}</td>
        </tr>`;
      }).join('')}
      <tr class="total-row">
        <td>Summe Betriebsausgaben</td>
        <td class="amount">${escapeHtml(fmtEuro(data.total_ausgaben))}</td>
        <td></td>
      </tr>

      <tr class="result-row">
        <td>${data.gewinn_verlust >= 0 ? 'Gewinn' : 'Verlust'}</td>
        <td class="amount ${data.gewinn_verlust >= 0 ? 'positive' : 'negative'}">
          ${escapeHtml(fmtEuro(Math.abs(data.gewinn_verlust)))}
        </td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <div class="subtitle">Erstellt am: ${escapeHtml(new Date().toLocaleDateString('de-DE'))}</div>
</body>
</html>`;

  printHtml(html);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function downloadText(
  filename: string,
  content: string,
  mimeType: string,
  prefix = '',
): void {
  const blob = new Blob([prefix + content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printHtml(html: string): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}
