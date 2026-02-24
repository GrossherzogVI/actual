import { useRef, useState } from 'react';

import { Upload, FileCheck, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { detectEncoding, decodeText } from './parsers/encoding';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

type Props = {
  onFileLoaded: (content: string, filename: string) => void;
};

type UploadState =
  | { kind: 'idle' }
  | { kind: 'dragging' }
  | { kind: 'loaded'; filename: string; size: number }
  | { kind: 'error'; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CsvUploadZone({ onFileLoaded }: Props) {
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  function validateFile(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'csv') {
      return `Ungültiger Dateityp: .${ext ?? '?'}. Bitte eine .csv-Datei auswählen.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `Datei zu groß: ${formatBytes(file.size)}. Maximum: ${formatBytes(MAX_SIZE_BYTES)}.`;
    }
    return null;
  }

  async function processFile(file: File) {
    const error = validateFile(file);
    if (error) {
      setUploadState({ kind: 'error', message: error });
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const encoding = detectEncoding(buffer);
      const content = decodeText(buffer, encoding);
      setUploadState({ kind: 'loaded', filename: file.name, size: file.size });
      onFileLoaded(content, file.name);
    } catch (err) {
      setUploadState({
        kind: 'error',
        message: `Fehler beim Lesen der Datei: ${String(err)}`,
      });
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setUploadState({ kind: 'idle' });

    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setUploadState({ kind: 'dragging' });
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setUploadState({ kind: 'idle' });
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input value so the same file can be re-selected
    e.target.value = '';
  }

  function handleClick() {
    inputRef.current?.click();
  }

  const isDragging = uploadState.kind === 'dragging';
  const isLoaded = uploadState.kind === 'loaded';
  const isError = uploadState.kind === 'error';

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.CSV"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      <motion.div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        animate={{
          borderColor: isDragging
            ? 'var(--fo-accent)'
            : isLoaded
              ? 'var(--fo-ok)'
              : isError
                ? 'var(--fo-danger)'
                : 'var(--fo-border)',
          backgroundColor: isDragging
            ? 'rgba(99,102,241,0.06)'
            : 'var(--fo-bg-2)',
        }}
        transition={{ duration: 0.15 }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '40px 24px',
          borderRadius: 10,
          border: '2px dashed var(--fo-border)',
          cursor: 'pointer',
          minHeight: 180,
          userSelect: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          {isLoaded ? (
            <motion.div
              key="loaded"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            >
              <FileCheck size={32} style={{ color: 'var(--fo-ok)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fo-text)' }}>
                {(uploadState as { kind: 'loaded'; filename: string }).filename}
              </span>
              <span style={{ fontSize: 12, color: 'var(--fo-muted)' }}>
                {formatBytes((uploadState as { kind: 'loaded'; size: number }).size)} — Datei
                erkannt
              </span>
              <span style={{ fontSize: 11, color: 'var(--fo-muted)' }}>
                Klicken um eine andere Datei auszuwählen
              </span>
            </motion.div>
          ) : isError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            >
              <AlertTriangle size={32} style={{ color: 'var(--fo-danger)' }} />
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--fo-danger)',
                  textAlign: 'center',
                  maxWidth: 300,
                }}
              >
                {(uploadState as { kind: 'error'; message: string }).message}
              </span>
              <span style={{ fontSize: 11, color: 'var(--fo-muted)' }}>
                Klicken um erneut zu versuchen
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            >
              <Upload
                size={28}
                style={{ color: isDragging ? 'var(--fo-accent)' : 'var(--fo-muted)' }}
              />
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--fo-text)' }}>
                {isDragging ? 'Datei hier ablegen' : 'CSV-Datei hochladen'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--fo-muted)' }}>
                Klicken oder Datei hierher ziehen · max. 10 MB
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--fo-muted)',
                  padding: '3px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--fo-border)',
                }}
              >
                .csv
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
