import { useRef, useState } from 'react';

import { Camera, FileImage, Upload, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

type Props = {
  onFileLoaded: (base64: string, fileName: string, fileType: string) => void;
  isUploading?: boolean;
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

export function OcrUploadZone({ onFileLoaded, isUploading }: Props) {
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function validateFile(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      return `Ungültiger Dateityp: .${ext ?? '?'}. Erlaubt: JPG, PNG, WebP, PDF.`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `Datei zu groß: ${formatBytes(file.size)}. Maximum: ${formatBytes(MAX_SIZE_BYTES)}.`;
    }
    return null;
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        resolve(dataUrl.split(',')[1]!);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function processFile(file: File) {
    const error = validateFile(file);
    if (error) {
      setUploadState({ kind: 'error', message: error });
      return;
    }

    try {
      const base64 = await fileToBase64(file);
      setUploadState({ kind: 'loaded', filename: file.name, size: file.size });
      onFileLoaded(base64, file.name, file.type);
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
    e.target.value = '';
  }

  function handleClick() {
    inputRef.current?.click();
  }

  function handleCameraClick(e: React.MouseEvent) {
    e.stopPropagation();
    cameraRef.current?.click();
  }

  const isDragging = uploadState.kind === 'dragging';
  const isLoaded = uploadState.kind === 'loaded';
  const isError = uploadState.kind === 'error';

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
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
            ? 'rgba(245,158,11,0.06)'
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
          cursor: isUploading ? 'wait' : 'pointer',
          minHeight: 180,
          userSelect: 'none',
          opacity: isUploading ? 0.6 : 1,
          pointerEvents: isUploading ? 'none' : 'auto',
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
              <FileImage size={32} style={{ color: 'var(--fo-ok)' }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fo-text)' }}>
                {(uploadState as { kind: 'loaded'; filename: string }).filename}
              </span>
              <span style={{ fontSize: 12, color: 'var(--fo-muted)' }}>
                {formatBytes((uploadState as { kind: 'loaded'; size: number }).size)} — Beleg erkannt
              </span>
              <span style={{ fontSize: 11, color: 'var(--fo-muted)' }}>
                Klicken um einen anderen Beleg auszuwählen
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
                {isDragging ? 'Beleg hier ablegen' : 'Beleg hochladen'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--fo-muted)' }}>
                Klicken oder Datei hierher ziehen · max. 15 MB
              </span>
              <div className="fo-row" style={{ gap: 6 }}>
                {['JPG', 'PNG', 'WebP', 'PDF'].map(ext => (
                  <span
                    key={ext}
                    style={{
                      fontSize: 11,
                      color: 'var(--fo-muted)',
                      padding: '3px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--fo-border)',
                    }}
                  >
                    .{ext.toLowerCase()}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCameraClick}
                className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  gap: 4,
                  marginTop: 4,
                  color: 'var(--fo-accent)',
                  backgroundColor: 'rgba(245,158,11,0.08)',
                  border: '1px solid rgba(245,158,11,0.15)',
                }}
              >
                <Camera size={14} />
                Kamera
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
