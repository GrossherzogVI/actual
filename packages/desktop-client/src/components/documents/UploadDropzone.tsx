// @ts-strict-ignore
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

export type SelectedFile = {
  name: string;
  type: string;
  content: string; // base64
};

type UploadDropzoneProps = {
  onFileSelected: (file: SelectedFile) => void;
  accept?: string;
  disabled?: boolean;
};

export function UploadDropzone({
  onFileSelected,
  accept = '.pdf,.png,.jpg,.jpeg',
  disabled = false,
}: UploadDropzoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        setSelectedName(file.name);
        onFileSelected({
          name: file.name,
          type: file.type,
          content: base64,
        });
      };
      reader.readAsDataURL(file);
    },
    [onFileSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [disabled, processFile],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setDragOver(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset so the same file can be re-selected
      e.target.value = '';
    },
    [processFile],
  );

  const borderColor = selectedName
    ? '#10b981'
    : dragOver
      ? theme.buttonPrimaryBackground
      : theme.tableBorder;

  const backgroundColor = dragOver
    ? theme.tableRowBackgroundHover
    : 'transparent';

  return (
    <View
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      style={{
        border: `2px dashed ${borderColor}`,
        borderRadius: 6,
        padding: '24px 20px',
        textAlign: 'center',
        cursor: disabled ? 'default' : 'pointer',
        backgroundColor,
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s, background-color 0.15s',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />
      {selectedName ? (
        <Text style={{ color: '#10b981', fontWeight: 500, fontSize: 13 }}>
          {selectedName}
        </Text>
      ) : (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Drop a file here or click to browse')}
        </Text>
      )}
    </View>
  );
}
