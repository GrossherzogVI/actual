// @ts-strict-ignore
import React, { useCallback, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { CategoryMapper } from './CategoryMapper';
import { ImportAdvisor } from './ImportAdvisor';
import { ImportPreview } from './ImportPreview';
import { useImport } from './hooks/useImport';
import { useBankFormatDetection } from './hooks/useBankFormatDetection';
import { useCategoryMapping } from './hooks/useCategoryMapping';
import type { BankFormat } from './types';

type Step = 1 | 2 | 3 | 4 | 5;

function StepIndicator({ step, total }: { step: Step; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 20 }}>
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <View
          key={n}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              n < step
                ? '#10b981'
                : n === step
                  ? theme.buttonPrimaryBackground
                  : theme.tableBorder,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: n <= step ? '#fff' : theme.pageTextSubdued,
            }}
          >
            {n < step ? '✓' : String(n)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFirstLine(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(text.split('\n')[0] ?? '');
    };
    reader.onerror = reject;
    reader.readAsText(file.slice(0, 4096));
  });
}

export function CsvImportWizard() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<BankFormat | null>(null);
  const [delimiter, setDelimiter] = useState(';');
  const [accountId, setAccountId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { formats, detectedFormat, detectFromHeader } = useBankFormatDetection();
  const { state, preview, result, error, loading, uploadAndPreview, commit, reset } = useImport({
    format: 'csv',
  });

  const externalCats: string[] = preview
    ? [...new Set(preview.rows.map(r => r.notes ?? '').filter(Boolean))]
    : [];

  const { mappings, matchedCount, updateMapping, autoMatch, getMappingRecord } =
    useCategoryMapping({ externalCategories: externalCats });

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f);
      const header = await readFirstLine(f);
      const detected = detectFromHeader(header);
      if (detected) setSelectedFormat(detected);
      setStep(2);
    },
    [detectFromHeader],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  const handlePreview = useCallback(async () => {
    if (!file) return;
    const b64 = await fileToBase64(file);
    await uploadAndPreview(b64, {
      bankFormat: selectedFormat?.id,
      delimiter,
    });
    setStep(3);
  }, [file, selectedFormat, delimiter, uploadAndPreview]);

  const handleCommit = useCallback(async () => {
    if (!preview) return;
    await commit({
      rows: preview.rows,
      accountId,
      categoryMapping: getMappingRecord(),
    });
    setStep(5);
  }, [preview, accountId, commit, getMappingRecord]);

  const handleReset = useCallback(() => {
    reset();
    setStep(1);
    setFile(null);
    setSelectedFormat(null);
  }, [reset]);

  return (
    <View style={{ maxWidth: 800, width: '100%' }}>
      <StepIndicator step={step} total={5} />

      {/* ── Step 1: File upload ── */}
      {step === 1 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            <Trans>Upload Bank CSV</Trans>
          </Text>
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            <Trans>
              Export your transactions from your bank as CSV and upload the file below.
            </Trans>
          </Text>

          <View
            style={{
              border: `2px dashed ${dragOver ? theme.buttonPrimaryBackground : theme.tableBorder}`,
              borderRadius: 10,
              padding: '48px 24px',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backgroundColor: dragOver
                ? `${theme.buttonPrimaryBackground}10`
                : theme.tableBackground,
              transition: 'all 0.15s',
              gap: 12,
            }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Text style={{ fontSize: 32 }}>📄</Text>
            <Text style={{ fontSize: 14, fontWeight: 500, color: theme.pageText }}>
              <Trans>Drop CSV file here or click to browse</Trans>
            </Text>
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              <Trans>Supports common German bank CSV exports</Trans>
            </Text>
          </View>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </View>
      )}

      {/* ── Step 2: Column mapping (bank format + delimiter) ── */}
      {step === 2 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            <Trans>Configure Import</Trans>
          </Text>

          {detectedFormat && (
            <View
              style={{
                padding: '10px 14px',
                backgroundColor: '#10b98110',
                borderRadius: 6,
                border: `1px solid #10b981`,
              }}
            >
              <Text style={{ fontSize: 13, color: '#10b981' }}>
                {t('Detected bank format: {{name}}', { name: detectedFormat.name })}
              </Text>
            </View>
          )}

          {/* Bank format selector */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: 500, color: theme.pageText }}>
              <Trans>Bank Format</Trans>
            </Text>
            <select
              value={selectedFormat?.id ?? ''}
              onChange={e => {
                const fmt = formats.find(f => f.id === e.target.value) ?? null;
                setSelectedFormat(fmt);
              }}
              style={{
                padding: '7px 10px',
                fontSize: 13,
                borderRadius: 4,
                border: `1px solid ${theme.tableBorder}`,
                backgroundColor: theme.tableBackground,
                color: theme.pageText,
                outline: 'none',
              }}
            >
              <option value="">{t('— Auto detect —')}</option>
              {formats.map(fmt => (
                <option key={fmt.id} value={fmt.id}>
                  {fmt.name} ({fmt.bank})
                </option>
              ))}
            </select>
          </View>

          {/* Delimiter */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 13, fontWeight: 500, color: theme.pageText }}>
              <Trans>Delimiter</Trans>
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[';', ',', '\t'].map(d => (
                <button
                  key={d}
                  onClick={() => setDelimiter(d)}
                  style={{
                    padding: '5px 14px',
                    fontSize: 13,
                    borderRadius: 4,
                    border: `1px solid ${delimiter === d ? theme.buttonPrimaryBackground : theme.tableBorder}`,
                    backgroundColor: delimiter === d ? `${theme.buttonPrimaryBackground}20` : theme.tableBackground,
                    color: delimiter === d ? theme.buttonPrimaryBackground : theme.pageText,
                    cursor: 'pointer',
                    fontFamily: 'monospace',
                  }}
                >
                  {d === '\t' ? 'TAB' : `"${d}"`}
                </button>
              ))}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="bare" onPress={handleReset}>
              <Trans>Start over</Trans>
            </Button>
            <Button variant="primary" onPress={handlePreview} isDisabled={loading}>
              {loading ? <Trans>Analyzing…</Trans> : <Trans>Next: Preview</Trans>}
            </Button>
          </View>
          {error && (
            <Text style={{ fontSize: 13, color: '#ef4444' }}>
              {t('Error: {{error}}', { error })}
            </Text>
          )}
        </View>
      )}

      {/* ── Step 3: Category mapping ── */}
      {step === 3 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            <Trans>Map Categories</Trans>
          </Text>
          {preview?.warnings.map((w, i) => (
            <Text key={i} style={{ fontSize: 12, color: '#f59e0b' }}>
              ⚠ {w}
            </Text>
          ))}
          <CategoryMapper
            mappings={mappings}
            matchedCount={matchedCount}
            internalCategories={[]}
            onUpdate={updateMapping}
            onAutoMatch={autoMatch}
          />
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="bare" onPress={() => setStep(2)}>
              <Trans>Back</Trans>
            </Button>
            <Button variant="primary" onPress={() => setStep(4)}>
              <Trans>Next: Review</Trans>
            </Button>
          </View>
        </View>
      )}

      {/* ── Step 4: Preview & confirm ── */}
      {step === 4 && preview && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            <Trans>Review & Confirm</Trans>
          </Text>
          <ImportPreview rows={preview.rows} total={preview.total} />
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="bare" onPress={() => setStep(3)}>
              <Trans>Back</Trans>
            </Button>
            <Button variant="primary" onPress={handleCommit} isDisabled={loading}>
              {loading ? <Trans>Importing…</Trans> : <Trans>Import Transactions</Trans>}
            </Button>
          </View>
          {error && (
            <Text style={{ fontSize: 13, color: '#ef4444' }}>
              {t('Error: {{error}}', { error })}
            </Text>
          )}
        </View>
      )}

      {/* ── Step 5: Results ── */}
      {step === 5 && result && (
        <ImportAdvisor result={result} onReset={handleReset} />
      )}
    </View>
  );
}
