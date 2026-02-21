// @ts-strict-ignore
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { Page } from '@desktop-client/components/Page';
import { Search } from '@desktop-client/components/common/Search';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { UploadDropzone, type SelectedFile } from './UploadDropzone';

type DocumentRecord = {
  id: string;
  file_id: string;
  contract_id: string | null;
  file_name: string;
  file_type: string;
  ocr_text: string | null;
  extracted_data: Record<string, unknown> | null;
  invoice_id: string | null;
  status: 'uploaded' | 'processing' | 'processed' | 'error';
  created_at: string;
  contract_name?: string;
};

const OCR_STATUS_COLORS: Record<string, string> = {
  uploaded: '#6b7280',
  processing: '#f59e0b',
  processed: '#10b981',
  error: '#ef4444',
};

const OCR_STATUS_LABELS: Record<string, string> = {
  uploaded: 'Not processed',
  processing: 'Processing...',
  processed: 'Processed',
  error: 'Error',
};

type TypeFilter = '' | 'pdf' | 'image';

function getFileTypeCategory(fileType: string): 'pdf' | 'image' | 'other' {
  if (fileType === 'application/pdf') return 'pdf';
  if (fileType.startsWith('image/')) return 'image';
  return 'other';
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  const category = getFileTypeCategory(fileType);
  return (
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 4,
        backgroundColor:
          category === 'pdf' ? '#ef444420' : '#3b82f620',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: category === 'pdf' ? '#ef4444' : '#3b82f6',
          textTransform: 'uppercase',
        }}
      >
        {category === 'pdf' ? 'PDF' : 'IMG'}
      </Text>
    </View>
  );
}

export function DocumentsPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('documentPipeline');
  const [budgetId] = useMetadataPref('id');
  const navigate = useNavigate();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!budgetId) return;
    setLoading(true);
    const result = await (send as Function)('document-list', {
      fileId: budgetId,
    });
    if (result && !('error' in result)) {
      setDocuments(result);
    }
    setLoading(false);
  }, [budgetId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    let docs = documents;
    if (typeFilter) {
      docs = docs.filter(d => getFileTypeCategory(d.file_type) === typeFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter(
        d =>
          d.file_name.toLowerCase().includes(q) ||
          (d.contract_name && d.contract_name.toLowerCase().includes(q)),
      );
    }
    return docs;
  }, [documents, typeFilter, searchQuery]);

  const handleUpload = useCallback(
    async (file: SelectedFile) => {
      if (!budgetId) return;
      setUploading(true);
      const result = await (send as Function)('document-upload', {
        fileId: budgetId,
        fileName: file.name,
        fileType: file.type,
        content: file.content,
      });
      if (result && !('error' in result)) {
        setDocuments(prev => [result, ...prev]);
        setShowUpload(false);
      }
      setUploading(false);
    },
    [budgetId],
  );

  const handleProcess = useCallback(
    async (id: string) => {
      setDocuments(prev =>
        prev.map(d => (d.id === id ? { ...d, status: 'processing' as const } : d)),
      );
      const result = await (send as Function)('document-process', { id });
      if (result && !('error' in result)) {
        void loadDocuments();
      }
    },
    [loadDocuments],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm(t('Are you sure you want to delete this document?'))) {
        return;
      }
      await (send as Function)('document-delete', { id });
      setDocuments(prev => prev.filter(d => d.id !== id));
    },
    [t],
  );

  if (!enabled) {
    return (
      <Page header={t('Documents')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Document pipeline is not enabled. Enable it in Settings > Feature Flags.')}
          </Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('Documents')}>
      {/* Upload toggle + filter bar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0 0 15px',
          gap: 10,
        }}
      >
        <Button
          variant={showUpload ? 'normal' : 'primary'}
          onPress={() => setShowUpload(prev => !prev)}
        >
          {showUpload ? <Trans>Hide upload</Trans> : <Trans>Upload document</Trans>}
        </Button>

        <View>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            style={{
              padding: '5px 10px',
              borderRadius: 4,
              border: `1px solid ${theme.tableBorder}`,
              backgroundColor: theme.tableBackground,
              color: theme.pageText,
              fontSize: 13,
            }}
          >
            <option value="">{t('All types')}</option>
            <option value="pdf">{t('PDF')}</option>
            <option value="image">{t('Image')}</option>
          </select>
        </View>

        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Search
            placeholder={t('Filter documents...')}
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </View>
      </View>

      {/* Upload dropzone */}
      {showUpload && (
        <View style={{ marginBottom: 15 }}>
          <UploadDropzone onFileSelected={handleUpload} disabled={uploading} />
          {uploading && (
            <Text
              style={{
                fontSize: 12,
                color: theme.pageTextSubdued,
                marginTop: 6,
                textAlign: 'center',
              }}
            >
              {t('Uploading...')}
            </Text>
          )}
        </View>
      )}

      {/* Document table */}
      <View
        style={{
          backgroundColor: theme.tableBackground,
          borderRadius: 4,
          overflow: 'hidden',
          flex: 1,
        }}
      >
        {/* Table header */}
        <View
          style={{
            flexDirection: 'row',
            padding: '8px 15px',
            borderBottom: `1px solid ${theme.tableBorder}`,
            backgroundColor: theme.tableHeaderBackground,
            fontSize: 12,
            fontWeight: 600,
            color: theme.pageTextSubdued,
          }}
        >
          <View style={{ width: 42 }} />
          <View style={{ flex: 2 }}>{t('Name')}</View>
          <View style={{ flex: 1 }}>{t('Upload date')}</View>
          <View style={{ flex: 1 }}>{t('Contract')}</View>
          <View style={{ flex: 1 }}>{t('OCR status')}</View>
          <View style={{ width: 140, textAlign: 'right' }}>{t('Actions')}</View>
        </View>

        {/* Table body */}
        {loading ? (
          <View style={{ padding: 20, textAlign: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>{t('Loading...')}</Text>
          </View>
        ) : filteredDocuments.length === 0 ? (
          <View style={{ padding: 20, textAlign: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              {searchQuery || typeFilter
                ? t('No documents match the current filters.')
                : t('No documents yet. Upload one to get started.')}
            </Text>
          </View>
        ) : (
          filteredDocuments.map(doc => (
            <View
              key={doc.id}
              onClick={() => navigate(`/documents/${doc.id}`)}
              style={{
                flexDirection: 'row',
                padding: '10px 15px',
                borderBottom: `1px solid ${theme.tableBorder}`,
                cursor: 'pointer',
                fontSize: 13,
                alignItems: 'center',
                ':hover': {
                  backgroundColor: theme.tableRowBackgroundHover,
                },
              }}
            >
              <View style={{ width: 42 }}>
                <FileTypeIcon fileType={doc.file_type} />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={{ fontWeight: 500 }}>{doc.file_name}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.pageTextSubdued }}>
                  {doc.created_at
                    ? new Date(doc.created_at).toLocaleDateString()
                    : '-'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.pageTextSubdued }}>
                  {doc.contract_name || '-'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <StatusBadge status={doc.status} />
              </View>
              <View
                style={{
                  width: 140,
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  gap: 6,
                }}
              >
                {doc.status === 'uploaded' && (
                  <Button
                    variant="bare"
                    onPress={() => handleProcess(doc.id)}
                    style={{ fontSize: 12 }}
                  >
                    <Trans>Process</Trans>
                  </Button>
                )}
                <Button
                  variant="bare"
                  onPress={() => handleDelete(doc.id)}
                  style={{ fontSize: 12, color: theme.errorText }}
                >
                  <Trans>Delete</Trans>
                </Button>
              </View>
            </View>
          ))
        )}
      </View>
    </Page>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = OCR_STATUS_COLORS[status] || '#6b7280';
  const label = OCR_STATUS_LABELS[status] || status;
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
      {label}
    </Text>
  );
}
