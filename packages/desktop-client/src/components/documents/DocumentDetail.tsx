// @ts-strict-ignore
import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

type DocumentRecord = {
  id: string;
  file_id: string;
  contract_id: string | null;
  file_name: string;
  file_type: string;
  ocr_text: string | null;
  extracted_data: ExtractedInvoice | null;
  invoice_id: string | null;
  status: 'uploaded' | 'processing' | 'processed' | 'error';
  created_at: string;
};

type ExtractedInvoice = {
  vendor?: string;
  amount?: number;
  due_date?: string;
  invoice_number?: string;
  description?: string;
  confidence?: number;
};

type ContractOption = {
  id: string;
  name: string;
};

const STATUS_COLORS: Record<string, string> = {
  uploaded: '#6b7280',
  processing: '#f59e0b',
  processed: '#10b981',
  error: '#ef4444',
};

export function DocumentDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const enabled = useFeatureFlag('documentPipeline');
  const [budgetId] = useMetadataPref('id');
  const navigate = useNavigate();

  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState('');

  const loadDocument = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const result = await (send as Function)('document-get', { id });
    if (result && !('error' in result)) {
      setDocument(result);
      setSelectedContractId(result.contract_id || '');
    }
    setLoading(false);
  }, [id]);

  const loadContracts = useCallback(async () => {
    if (!budgetId) return;
    const result = await (send as Function)('contract-list', {
      fileId: budgetId,
    });
    if (result && !('error' in result)) {
      setContracts(
        result.map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        })),
      );
    }
  }, [budgetId]);

  useEffect(() => {
    void loadDocument();
    void loadContracts();
  }, [loadDocument, loadContracts]);

  const handleProcess = useCallback(async () => {
    if (!id) return;
    setProcessing(true);
    await (send as Function)('document-process', { id });
    await loadDocument();
    setProcessing(false);
  }, [id, loadDocument]);

  const handleLinkContract = useCallback(async () => {
    if (!id || !selectedContractId) return;
    await (send as Function)('document-upload', {
      id,
      contractId: selectedContractId,
    });
    await loadDocument();
  }, [id, selectedContractId, loadDocument]);

  if (!enabled) {
    return (
      <Page header={t('Document')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Document pipeline is not enabled.')}
          </Text>
        </View>
      </Page>
    );
  }

  if (loading) {
    return (
      <Page header={t('Document')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>{t('Loading...')}</Text>
        </View>
      </Page>
    );
  }

  if (!document) {
    return (
      <Page header={t('Document')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.errorText }}>
            {t('Document not found.')}
          </Text>
          <Button
            onPress={() => navigate('/documents')}
            style={{ marginTop: 10 }}
          >
            <Trans>Back to documents</Trans>
          </Button>
        </View>
      </Page>
    );
  }

  const extracted = document.extracted_data;
  const statusColor = STATUS_COLORS[document.status] || '#6b7280';

  return (
    <Page header={document.file_name}>
      <View style={{ maxWidth: 700, padding: '0 0 20px' }}>
        {/* Back button */}
        <View style={{ marginBottom: 15 }}>
          <Button variant="bare" onPress={() => navigate('/documents')}>
            <Trans>Back to documents</Trans>
          </Button>
        </View>

        {/* Metadata section */}
        <Section title={t('Document info')}>
          <MetaRow label={t('File name')} value={document.file_name} />
          <MetaRow label={t('Type')} value={document.file_type} />
          <MetaRow
            label={t('Uploaded')}
            value={
              document.created_at
                ? new Date(document.created_at).toLocaleDateString()
                : '-'
            }
          />
          <MetaRow
            label={t('Status')}
            value={
              <Text
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 500,
                  backgroundColor: `${statusColor}20`,
                  color: statusColor,
                  textTransform: 'capitalize',
                }}
              >
                {document.status}
              </Text>
            }
          />

          {/* Link to contract */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: theme.pageTextSubdued,
                width: 120,
                flexShrink: 0,
              }}
            >
              {t('Linked contract')}
            </Text>
            <select
              value={selectedContractId}
              onChange={e => setSelectedContractId(e.target.value)}
              style={selectStyle}
            >
              <option value="">{t('None')}</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {selectedContractId !== (document.contract_id || '') && (
              <Button variant="bare" onPress={handleLinkContract}>
                <Trans>Save</Trans>
              </Button>
            )}
          </View>
        </Section>

        {/* Process button */}
        {(document.status === 'uploaded' || document.status === 'error') && (
          <View style={{ margin: '15px 0' }}>
            <ButtonWithLoading
              variant="primary"
              isLoading={processing}
              onPress={handleProcess}
            >
              <Trans>Process document (OCR)</Trans>
            </ButtonWithLoading>
          </View>
        )}

        {/* OCR Text */}
        {document.ocr_text && (
          <Section title={t('OCR Text')}>
            <View
              style={{
                padding: 12,
                backgroundColor: theme.tableBackground,
                borderRadius: 4,
                border: `1px solid ${theme.tableBorder}`,
                maxHeight: 300,
                overflow: 'auto',
              }}
            >
              <Text
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  whiteSpace: 'pre-wrap',
                  color: theme.pageText,
                  lineHeight: 1.5,
                }}
              >
                {document.ocr_text}
              </Text>
            </View>
          </Section>
        )}

        {/* Extracted Invoice Data */}
        {extracted && (
          <Section title={t('Extracted invoice data')}>
            <MetaRow label={t('Vendor')} value={extracted.vendor || '-'} />
            <MetaRow
              label={t('Amount')}
              value={
                extracted.amount != null
                  ? (extracted.amount / 100).toFixed(2)
                  : '-'
              }
            />
            <MetaRow label={t('Due date')} value={extracted.due_date || '-'} />
            <MetaRow
              label={t('Invoice number')}
              value={extracted.invoice_number || '-'}
            />
            <MetaRow
              label={t('Description')}
              value={extracted.description || '-'}
            />
            {extracted.confidence != null && (
              <MetaRow
                label={t('Confidence')}
                value={
                  <ConfidenceBadge confidence={extracted.confidence} />
                }
              />
            )}
          </Section>
        )}

        {/* Invoice status */}
        {document.invoice_id && (
          <Section title={t('Invoice')}>
            <MetaRow label={t('Invoice ID')} value={document.invoice_id} />
          </Section>
        )}
      </View>
    </Page>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: theme.pageText,
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: '4px 0',
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: theme.pageTextSubdued,
          width: 120,
          flexShrink: 0,
        }}
      >
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text style={{ fontSize: 13, color: theme.pageText }}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <Text
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 500,
        backgroundColor: `${color}20`,
        color,
      }}
    >
      {pct}%
    </Text>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 4,
  border: '1px solid #ccc',
  backgroundColor: '#fff',
  fontSize: 13,
  flex: 1,
};
