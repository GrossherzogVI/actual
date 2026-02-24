import { useState } from 'react';

import {
  Check,
  FileImage,
  Filter,
  Link,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { formatEur } from '@/core/utils/format';

import { OcrMatchSuggestion } from './OcrMatchSuggestion';
import { OcrResultPreview } from './OcrResultPreview';
import { OcrUploadZone } from './OcrUploadZone';
import type { Receipt, ReceiptStatus } from './types';
import {
  useDeleteReceipt,
  useLinkReceipt,
  useMatchCandidates,
  useReceipts,
  useUpdateReceipt,
  useUploadReceipt,
} from './useOcrProcess';

const STATUS_CONFIG: Record<
  ReceiptStatus,
  { label: string; color: string; bg: string }
> = {
  pending: { label: 'Ausstehend', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  processing: { label: 'Verarbeitung', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  processed: { label: 'Erkannt', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
  matched: { label: 'Verknüpft', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  failed: { label: 'Fehlgeschlagen', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

type StatusFilter = ReceiptStatus | 'all';

// Timestamp formatter (includes time) — distinct from the date-only shared formatDate
const timestampFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatTimestamp(dateStr: string): string {
  try {
    return timestampFormatter.format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function ReceiptInbox() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: receipts = [], isLoading } = useReceipts(
    statusFilter === 'all' ? undefined : { status: statusFilter },
  );
  const uploadMutation = useUploadReceipt();
  const updateMutation = useUpdateReceipt();
  const linkMutation = useLinkReceipt();
  const deleteMutation = useDeleteReceipt();

  // Match candidates for selected receipt
  const { data: matchCandidates = [] } = useMatchCandidates(
    selectedReceipt?.extracted_amount,
    selectedReceipt?.extracted_date,
  );

  const filteredReceipts = searchQuery
    ? receipts.filter(
        r =>
          r.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.extracted_vendor?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : receipts;

  // Status summary counts
  const statusCounts = receipts.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  function handleUpload(base64: string, fileName: string, fileType: string) {
    uploadMutation.mutate({ base64, fileName, fileType });
  }

  function handleSaveEdits(data: {
    extracted_amount?: number;
    extracted_date?: string;
    extracted_vendor?: string;
  }) {
    if (!selectedReceipt) return;
    updateMutation.mutate({ id: selectedReceipt.id, ...data });
  }

  function handleLink(transactionId: string) {
    if (!selectedReceipt) return;
    linkMutation.mutate({
      receiptId: selectedReceipt.id,
      transactionId,
    });
  }

  function handleDelete(id: string) {
    if (selectedReceipt?.id === id) setSelectedReceipt(null);
    deleteMutation.mutate(id);
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* Upload zone */}
      <OcrUploadZone
        onFileLoaded={handleUpload}
        isUploading={uploadMutation.isPending}
      />

      {/* Status filter pills */}
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="fo-space-between">
          <div className="fo-row" style={{ gap: 6 }}>
            <Filter size={14} style={{ color: 'var(--fo-muted)' }} />
            <span className="text-xs font-medium text-[var(--fo-muted)]">Status</span>
          </div>
          <span className="text-[10px] text-[var(--fo-muted)]">
            {receipts.length} Belege gesamt
          </span>
        </div>

        <div className="fo-row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`fo-chip text-[11px] ${statusFilter === 'all' ? 'fo-chip-active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            Alle ({receipts.length})
          </button>
          {(Object.keys(STATUS_CONFIG) as ReceiptStatus[]).map(status => {
            const count = statusCounts[status] ?? 0;
            if (count === 0 && statusFilter !== status) return null;
            const config = STATUS_CONFIG[status];
            return (
              <button
                key={status}
                type="button"
                className={`fo-chip text-[11px] ${statusFilter === status ? 'fo-chip-active' : ''}`}
                onClick={() => setStatusFilter(status)}
                style={
                  statusFilter === status
                    ? { color: config.color, borderColor: config.color }
                    : undefined
                }
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: config.color, marginRight: 4 }}
                />
                {config.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="fo-row" style={{ position: 'relative' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: 10,
            color: 'var(--fo-muted)',
          }}
        />
        <input
          className="fo-input"
          style={{ paddingLeft: 32, fontSize: 13 }}
          placeholder="Belege durchsuchen..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: 10,
              background: 'none',
              border: 'none',
              color: 'var(--fo-muted)',
              cursor: 'pointer',
              padding: 2,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Receipt list + detail split */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedReceipt ? '1fr 1fr' : '1fr',
          gap: 16,
          minHeight: 200,
        }}
      >
        {/* List */}
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          {isLoading ? (
            <div className="fo-row" style={{ justifyContent: 'center', padding: 40 }}>
              <Loader2 size={20} className="animate-spin" style={{ color: 'var(--fo-muted)' }} />
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: 'var(--fo-muted)',
                fontSize: 13,
              }}
            >
              {searchQuery
                ? 'Keine Belege gefunden'
                : 'Noch keine Belege vorhanden. Laden Sie einen Beleg hoch.'}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredReceipts.map(receipt => {
                const statusConfig = STATUS_CONFIG[receipt.status];
                const isSelected = selectedReceipt?.id === receipt.id;

                return (
                  <motion.div
                    key={receipt.id}
                    layout
                    className="fo-card"
                    style={{
                      cursor: 'pointer',
                      borderColor: isSelected
                        ? 'rgba(59,130,246,0.4)'
                        : undefined,
                      backgroundColor: isSelected
                        ? 'rgba(59,130,246,0.04)'
                        : undefined,
                    }}
                    onClick={() => setSelectedReceipt(receipt)}
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="fo-space-between">
                      <div className="fo-row" style={{ gap: 8 }}>
                        <FileImage size={16} style={{ color: 'var(--fo-muted)' }} />
                        <div style={{ display: 'grid', gap: 2 }}>
                          <span className="text-sm font-medium text-[var(--fo-text)] truncate" style={{ maxWidth: 200 }}>
                            {receipt.extracted_vendor ?? receipt.file_name}
                          </span>
                          <span className="text-[10px] text-[var(--fo-muted)]">
                            {formatTimestamp(receipt.created_at)}
                          </span>
                        </div>
                      </div>

                      <div className="fo-row" style={{ gap: 8 }}>
                        {receipt.extracted_amount != null && (
                          <span
                            className="text-sm font-semibold tabular-nums"
                            style={{ fontVariantNumeric: 'tabular-nums', color: '#f87171' }}
                          >
                            {formatEur(receipt.extracted_amount)}
                          </span>
                        )}
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ color: statusConfig.color, backgroundColor: statusConfig.bg }}
                        >
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: statusConfig.color }}
                          />
                          {statusConfig.label}
                        </span>
                      </div>
                    </div>

                    {/* Quick actions */}
                    <div className="fo-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      {receipt.status === 'processed' && (
                        <span className="text-[10px] text-[var(--fo-muted)] fo-row" style={{ gap: 3 }}>
                          <Link size={10} />
                          Bereit zur Verknüpfung
                        </span>
                      )}
                      {receipt.status === 'matched' && (
                        <span className="text-[10px] fo-row" style={{ gap: 3, color: '#34d399' }}>
                          <Check size={10} />
                          Verknüpft
                        </span>
                      )}
                      <button
                        type="button"
                        className="rounded p-1 transition-colors"
                        style={{
                          color: 'var(--fo-muted)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(receipt.id);
                        }}
                        aria-label="Beleg löschen"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>

        {/* Detail panel */}
        {selectedReceipt && (
          <motion.div
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'grid', gap: 12, alignContent: 'start' }}
          >
            <OcrResultPreview
              receipt={selectedReceipt}
              onSave={handleSaveEdits}
              isSaving={updateMutation.isPending}
            />

            {selectedReceipt.status === 'processed' && (
              <OcrMatchSuggestion
                candidates={matchCandidates}
                onLink={handleLink}
                linkedId={selectedReceipt.transaction_link ?? undefined}
                isLinking={linkMutation.isPending}
              />
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
