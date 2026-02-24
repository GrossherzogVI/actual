import { useState } from 'react';

import { useQuery, useMutation } from '@tanstack/react-query';
import { ChevronLeft, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import {
  bulkCreateTransactions,
  createImportBatch,
  listAccounts,
} from '../../core/api/finance-api';
import type { Account } from '../../core/types/finance';
import { BankFormatSelector } from './BankFormatSelector';
import { CsvPreviewTable } from './CsvPreviewTable';
import { CsvUploadZone } from './CsvUploadZone';
import { DuplicateResolver } from './DuplicateResolver';
import { ImportProgressBar } from './ImportProgressBar';
import { ImportSummaryCard } from './ImportSummaryCard';
import { parseDkb } from './parsers/dkb';
import { parseGeneric, detectColumns } from './parsers/generic';
import { parseIng } from './parsers/ing';
import { parseSparkasse } from './parsers/sparkasse';
import { findPotentialDuplicates } from './parsers/dedup';
import type { BankFormat, ColumnMapping, ParsedRow } from './parsers/types';
import { useImportFlow } from './useImportFlow';

const STEP_LABELS: Record<string, string> = {
  select: 'Bank wählen',
  upload: 'Datei hochladen',
  mapping: 'Spalten zuordnen',
  preview: 'Vorschau',
  import: 'Importieren',
  done: 'Fertig',
};

const ALL_STEPS = ['select', 'upload', 'preview', 'import', 'done'] as const;

function parseFile(content: string, format: BankFormat, mapping?: ColumnMapping) {
  switch (format) {
    case 'dkb':
      return parseDkb(content);
    case 'ing':
      return parseIng(content);
    case 'sparkasse':
    case 'commerzbank':
      return parseSparkasse(content);
    case 'n26':
      // N26 uses a similar format to generic with comma delimiter
      return parseGeneric(content, mapping ?? { date: 0, amount: 4, payee: 2, notes: 3 }, ',');
    case 'generic':
      if (!mapping) throw new Error('Generic format requires a column mapping');
      return parseGeneric(content, mapping);
  }
}

export function ImportPage() {
  const flow = useImportFlow();
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, duplicates: 0 });

  // Generic column mapping state
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<{
    headers: string[];
    sampleRows: string[][];
  } | null>(null);

  // Rows kept after duplicate resolution
  const [resolvedRows, setResolvedRows] = useState<ParsedRow[] | null>(null);

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn: listAccounts,
  });

  const importMutation = useMutation({
    mutationFn: async (rows: ParsedRow[]) => {
      if (!selectedAccountId) throw new Error('Kein Konto ausgewählt.');

      flow.actions.startImport();
      setImportProgress({ current: 0, total: rows.length, duplicates: 0 });

      const batchName = `Import ${new Date().toLocaleDateString('de-DE')} — ${flow.parsedResult?.bankName ?? 'CSV'}`;
      await createImportBatch(batchName, rows.length, flow.parsedResult?.bankName ?? 'csv');

      // Process in chunks of 50 to show progress
      const CHUNK = 50;
      let created = 0;
      let duplicates = 0;

      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const result = await bulkCreateTransactions(
          chunk.map(row => ({
            date: row.date,
            amount: row.amount,
            account: selectedAccountId,
            payee: undefined,
            category: undefined,
            notes: [row.payee, row.notes].filter(Boolean).join(' — ') || undefined,
          })),
        );
        created += result.created;
        duplicates += result.duplicates;
        setImportProgress({ current: i + chunk.length, total: rows.length, duplicates });
      }

      return { created, duplicates };
    },
    onSuccess: result => {
      flow.actions.finishImport(result);
    },
  });

  // Handle file upload: parse and move to next step
  function handleFileLoaded(content: string, filename: string) {
    flow.actions.uploadFile(content, filename);

    if (flow.bankFormat === 'generic') {
      const cols = detectColumns(content);
      setDetectedColumns(cols);
      // Don't call setParsedResult yet — wait for column mapping
      return;
    }

    try {
      const result = parseFile(content, flow.bankFormat!);
      flow.actions.setParsedResult(result);
    } catch (err) {
      flow.actions.setParsedResult({
        rows: [],
        errors: [`Fehler beim Parsen: ${String(err)}`],
        bankName: 'Unbekannt',
        encoding: 'utf-8',
      });
    }
  }

  // Handle generic column mapping submit
  function handleMappingSubmit(mapping: ColumnMapping) {
    setColumnMapping(mapping);
    if (!flow.file) return;
    try {
      const result = parseGeneric(flow.file.content, mapping);
      flow.actions.setColumnMapping(mapping);
      flow.actions.setParsedResult(result);
    } catch (err) {
      flow.actions.setParsedResult({
        rows: [],
        errors: [`Fehler beim Parsen: ${String(err)}`],
        bankName: 'Unbekannt',
        encoding: 'utf-8',
      });
    }
  }

  // Handle duplicate resolution: user has decided what to keep
  function handleDuplicateResolution(kept: ParsedRow[]) {
    setResolvedRows(kept);
  }

  // The rows to actually import: resolved rows or all parsed rows
  const rowsToImport =
    resolvedRows ?? flow.parsedResult?.rows ?? [];

  // Compute duplicates for preview step
  const duplicatePairs =
    flow.step === 'preview' && flow.parsedResult
      ? findPotentialDuplicates(flow.parsedResult.rows, []) // No live fetch — dedup done server-side
      : [];

  const canGoBack =
    flow.step !== 'select' && flow.step !== 'done' && flow.step !== 'import';

  const stepIndex = ALL_STEPS.indexOf(flow.step as (typeof ALL_STEPS)[number]);

  return (
    <motion.div
      className="p-5 h-full overflow-auto"
      style={{ display: 'grid', gap: 20, alignContent: 'start', maxWidth: 760, margin: '0 auto' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Page header */}
      <header className="fo-panel-header">
        <div className="fo-space-between">
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Upload size={18} />
            CSV-Import
          </h1>
          {flow.step !== 'done' && (
            <span style={{ fontSize: 12, color: 'var(--fo-muted)' }}>
              Schritt{' '}
              <strong>{stepIndex + 1}</strong>
              {' / '}
              <strong>{ALL_STEPS.length}</strong>
            </span>
          )}
        </div>
      </header>

      {/* Step indicator */}
      {flow.step !== 'done' && (
        <div className="fo-row" style={{ gap: 6 }}>
          {ALL_STEPS.map((s, i) => {
            const isActive = s === flow.step;
            const isDone = i < stepIndex;
            return (
              <div key={s} className="fo-row" style={{ gap: 6, flex: i < ALL_STEPS.length - 1 ? 1 : 'none' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      backgroundColor: isActive
                        ? 'var(--fo-accent)'
                        : isDone
                          ? 'var(--fo-ok)'
                          : 'var(--fo-bg)',
                      color: isActive || isDone ? '#fff' : 'var(--fo-muted)',
                      border: `1.5px solid ${isActive ? 'var(--fo-accent)' : isDone ? 'var(--fo-ok)' : 'var(--fo-border)'}`,
                      transition: 'all 0.2s',
                    }}
                  >
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: isActive ? 'var(--fo-text)' : 'var(--fo-muted)',
                      fontWeight: isActive ? 600 : 400,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {STEP_LABELS[s]}
                  </span>
                </div>
                {i < ALL_STEPS.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      backgroundColor: isDone ? 'var(--fo-ok)' : 'var(--fo-border)',
                      transition: 'background-color 0.3s',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Account selector — shown for all non-done steps */}
      {flow.step !== 'select' && flow.step !== 'done' && (
        <div className="fo-card" style={{ padding: '12px 16px' }}>
          <div className="fo-row" style={{ justifyContent: 'space-between', gap: 12 }}>
            <label
              htmlFor="account-select"
              style={{ fontSize: 13, color: 'var(--fo-muted)', whiteSpace: 'nowrap' }}
            >
              Zielkonto:
            </label>
            <select
              id="account-select"
              className="fo-input"
              style={{ fontSize: 13, flex: 1, maxWidth: 320 }}
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              <option value="">— Konto wählen —</option>
              {accounts.map((acc: Account) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Main content area */}
      <section className="fo-panel">
        <AnimatePresence mode="wait">
          <motion.div
            key={flow.step}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            {/* Step: select bank */}
            {flow.step === 'select' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <header className="fo-panel-header">
                  <h2>Bank auswählen</h2>
                </header>
                <BankFormatSelector
                  selected={flow.bankFormat}
                  onSelect={format => flow.actions.selectBank(format)}
                />
              </div>
            )}

            {/* Step: upload */}
            {flow.step === 'upload' && (
              <div style={{ display: 'grid', gap: 16 }}>
                <header className="fo-panel-header">
                  <h2>CSV-Datei hochladen</h2>
                </header>
                <p className="fo-muted-line">
                  Exportiere deine Kontoauszüge aus dem Online-Banking als CSV-Datei und lade sie
                  hier hoch. Windows-1252-Kodierung wird automatisch erkannt.
                </p>
                <CsvUploadZone onFileLoaded={handleFileLoaded} />
              </div>
            )}

            {/* Step: generic column mapping */}
            {flow.step === 'mapping' && detectedColumns && (
              <GenericMappingStep
                headers={detectedColumns.headers}
                sampleRows={detectedColumns.sampleRows}
                onSubmit={handleMappingSubmit}
              />
            )}

            {/* Step: preview */}
            {flow.step === 'preview' && flow.parsedResult && (
              <div style={{ display: 'grid', gap: 16 }}>
                <header className="fo-panel-header">
                  <h2>Vorschau — {flow.parsedResult.bankName}</h2>
                </header>
                <CsvPreviewTable
                  rows={flow.parsedResult.rows}
                  errors={flow.parsedResult.errors}
                />

                {/* Duplicate resolver — only show if there are duplicates */}
                {duplicatePairs.some(d => d.duplicateOf) && (
                  <DuplicateResolver
                    duplicates={duplicatePairs}
                    onResolve={handleDuplicateResolution}
                  />
                )}

                {/* Import button */}
                {flow.parsedResult.rows.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="fo-btn fo-row"
                      disabled={!selectedAccountId || importMutation.isPending}
                      onClick={() => importMutation.mutate(rowsToImport)}
                      style={{
                        padding: '8px 18px',
                        fontSize: 14,
                        fontWeight: 600,
                        gap: 8,
                        backgroundColor: selectedAccountId ? 'var(--fo-accent)' : 'var(--fo-bg)',
                        color: selectedAccountId ? '#fff' : 'var(--fo-muted)',
                        border: 'none',
                        opacity: selectedAccountId ? 1 : 0.5,
                        cursor: selectedAccountId ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <Upload size={15} />
                      {rowsToImport.length} Transaktionen importieren
                    </button>
                  </div>
                )}

                {!selectedAccountId && (
                  <p style={{ fontSize: 12, color: 'var(--fo-danger)', textAlign: 'right' }}>
                    Bitte zuerst ein Zielkonto auswählen.
                  </p>
                )}
              </div>
            )}

            {/* Step: importing (progress) */}
            {flow.step === 'import' && (
              <div style={{ display: 'grid', gap: 20, padding: '12px 0' }}>
                <header className="fo-panel-header">
                  <h2>Import läuft…</h2>
                </header>
                <ImportProgressBar
                  current={importProgress.current}
                  total={importProgress.total}
                  duplicates={importProgress.duplicates}
                />
                {importMutation.isError && (
                  <p style={{ fontSize: 13, color: 'var(--fo-danger)' }}>
                    Fehler: {String(importMutation.error)}
                  </p>
                )}
              </div>
            )}

            {/* Step: done */}
            {flow.step === 'done' && flow.importResult && (
              <ImportSummaryCard
                created={flow.importResult.created}
                duplicates={flow.importResult.duplicates}
                onReset={flow.actions.reset}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Back button */}
      {canGoBack && (
        <div>
          <button
            type="button"
            className="fo-btn fo-row"
            onClick={flow.actions.goBack}
            style={{ fontSize: 12, padding: '5px 12px', gap: 5, color: 'var(--fo-muted)' }}
          >
            <ChevronLeft size={14} />
            Zurück
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ---- Generic column mapping step ----

type GenericMappingStepProps = {
  headers: string[];
  sampleRows: string[][];
  onSubmit: (mapping: ColumnMapping) => void;
};

function GenericMappingStep({ headers, sampleRows, onSubmit }: GenericMappingStepProps) {
  const [dateCol, setDateCol] = useState<number>(0);
  const [amountCol, setAmountCol] = useState<number>(1);
  const [payeeCol, setPayeeCol] = useState<number>(2);
  const [notesCol, setNotesCol] = useState<number>(3);
  const [ibanCol, setIbanCol] = useState<number>(-1);

  function handleSubmit() {
    onSubmit({
      date: dateCol,
      amount: amountCol,
      payee: payeeCol,
      notes: notesCol,
      iban: ibanCol >= 0 ? ibanCol : undefined,
    });
  }

  const colOptions = headers.map((h, i) => ({ value: i, label: `${i + 1}: ${h || '(leer)'}` }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <header className="fo-panel-header">
        <h2>Spalten zuordnen</h2>
      </header>
      <p className="fo-muted-line">
        Deine Bank wurde nicht erkannt. Ordne den CSV-Spalten die richtigen Felder zu.
      </p>

      {/* Sample data preview */}
      {sampleRows.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 6, border: '1px solid var(--fo-border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--fo-bg)' }}>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '6px 10px',
                      textAlign: 'left',
                      color: 'var(--fo-muted)',
                      borderBottom: '1px solid var(--fo-border)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {i + 1}: {h || '—'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.slice(0, 3).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '5px 10px',
                        color: 'var(--fo-muted)',
                        borderBottom: ri < 2 ? '1px solid var(--fo-border)' : 'none',
                        whiteSpace: 'nowrap',
                        maxWidth: 120,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontSize: 11,
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mapping selects */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 12,
        }}
      >
        {(
          [
            { label: 'Datum *', value: dateCol, onChange: setDateCol },
            { label: 'Betrag *', value: amountCol, onChange: setAmountCol },
            { label: 'Empfänger / Auftraggeber *', value: payeeCol, onChange: setPayeeCol },
            { label: 'Verwendungszweck *', value: notesCol, onChange: setNotesCol },
          ] as const
        ).map(field => (
          <div key={field.label} style={{ display: 'grid', gap: 4 }}>
            <label style={{ fontSize: 12, color: 'var(--fo-muted)' }}>{field.label}</label>
            <select
              className="fo-input"
              style={{ fontSize: 12 }}
              value={field.value}
              onChange={e => field.onChange(Number(e.target.value))}
            >
              {colOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div style={{ display: 'grid', gap: 4 }}>
          <label style={{ fontSize: 12, color: 'var(--fo-muted)' }}>IBAN (optional)</label>
          <select
            className="fo-input"
            style={{ fontSize: 12 }}
            value={ibanCol}
            onChange={e => setIbanCol(Number(e.target.value))}
          >
            <option value={-1}>— nicht zuordnen —</option>
            {colOptions.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="fo-btn"
          onClick={handleSubmit}
          style={{
            padding: '8px 18px',
            fontSize: 13,
            backgroundColor: 'var(--fo-accent)',
            color: '#fff',
            border: 'none',
          }}
        >
          Vorschau anzeigen
        </button>
      </div>
    </div>
  );
}
