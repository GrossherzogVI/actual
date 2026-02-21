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
import { useCategoryMapping } from './hooks/useCategoryMapping';

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
              n < step ? '#10b981' : n === step ? theme.buttonPrimaryBackground : theme.tableBorder,
            color: n <= step ? theme.buttonPrimaryText : theme.pageTextSubdued,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: 600, color: n <= step ? '#fff' : theme.pageTextSubdued }}>
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
      // Strip data URL prefix, keep raw base64
      resolve(result.split(',')[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function FinanzguruWizard() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { state, preview, result, error, loading, uploadAndPreview, commit, reset } = useImport({
    format: 'finanzguru',
  });

  // Extract unique external categories from preview rows (via notes field as proxy)
  const externalCats: string[] = preview
    ? [...new Set(preview.rows.map(r => r.notes ?? '').filter(Boolean))]
    : [];

  const { mappings, matchedCount, updateMapping, autoMatch, getMappingRecord } =
    useCategoryMapping({ externalCategories: externalCats });

  const handleFile = useCallback(
    async (f: File) => {
      setFile(f);
      const b64 = await fileToBase64(f);
      await uploadAndPreview(b64);
      setStep(2);
    },
    [uploadAndPreview],
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

  const handleCommit = useCallback(async () => {
    if (!preview) return;
    await commit({
      rows: preview.rows,
      accountMapping: {},
      categoryMapping: getMappingRecord(),
    });
    setStep(5);
  }, [preview, commit, getMappingRecord]);

  const handleReset = useCallback(() => {
    reset();
    setStep(1);
    setFile(null);
  }, [reset]);

  return (
    <View style={{ maxWidth: 800, width: '100%' }}>
      <StepIndicator step={step} total={5} />

      {/* ── Step 1: File upload ── */}
      {step === 1 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            <Trans>Upload Finanzguru Export</Trans>
          </Text>
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            <Trans>
              Export your transactions from Finanzguru as XLSX and upload the file below.
            </Trans>
          </Text>

          {/* Drop zone */}
          <View
            style={{
              border: `2px dashed ${dragOver ? theme.buttonPrimaryBackground : theme.tableBorder}`,
              borderRadius: 10,
              padding: '48px 24px',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backgroundColor: dragOver ? `${theme.buttonPrimaryBackground}10` : theme.tableBackground,
              transition: 'all 0.15s',
              gap: 12,
            }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Text style={{ fontSize: 32 }}>📂</Text>
            <Text style={{ fontSize: 14, fontWeight: 500, color: theme.pageText }}>
              <Trans>Drop XLSX file here or click to browse</Trans>
            </Text>
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              <Trans>Supports Finanzguru XLSX export format</Trans>
            </Text>
          </View>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />

          {loading && (
            <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
              <Trans>Uploading and analyzing…</Trans>
            </Text>
          )}
          {error && (
            <Text style={{ fontSize: 13, color: '#ef4444' }}>
              {t('Error: {{error}}', { error })}
            </Text>
          )}
        </View>
      )}

      {/* ── Step 2: Column mapping preview ── */}
      {step === 2 && preview && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            <Trans>Column Mapping Preview</Trans>
          </Text>
          {preview.detected_format && (
            <Text style={{ fontSize: 13, color: '#10b981' }}>
              {t('Detected format: {{format}}', { format: preview.detected_format })}
            </Text>
          )}
          {preview.warnings.length > 0 && (
            <View style={{ gap: 4 }}>
              {preview.warnings.map((w, i) => (
                <Text key={i} style={{ fontSize: 12, color: '#f59e0b' }}>
                  ⚠ {w}
                </Text>
              ))}
            </View>
          )}
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            {t('Found {{n}} transactions in {{file}}', {
              n: preview.total,
              file: file?.name ?? '',
            })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="bare" onPress={handleReset}>
              <Trans>Start over</Trans>
            </Button>
            <Button variant="primary" onPress={() => setStep(3)}>
              <Trans>Next: Map categories</Trans>
            </Button>
          </View>
        </View>
      )}

      {/* ── Step 3: Category mapping ── */}
      {step === 3 && (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            <Trans>Map Categories</Trans>
          </Text>
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            <Trans>
              Match categories from your Finanzguru export to your Actual Budget categories.
            </Trans>
          </Text>
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
              <Trans>Next: Preview</Trans>
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
