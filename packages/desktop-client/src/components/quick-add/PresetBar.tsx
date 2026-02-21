// @ts-strict-ignore
import React from 'react';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { Preset } from './types';

type PresetBarProps = {
  presets: Preset[];
  onSelect: (preset: Preset) => void;
};

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PresetBar({ presets, onSelect }: PresetBarProps) {
  if (presets.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        overflowX: 'auto',
        gap: 6,
        padding: '10px 16px',
        borderBottom: `1px solid ${theme.tableBorderSeparator}`,
        scrollbarWidth: 'none',
      }}
    >
      {presets.map(preset => (
        <Button
          key={preset.id}
          variant="bare"
          onPress={() => onSelect(preset)}
          style={{
            flexShrink: 0,
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '6px 10px',
            borderRadius: 8,
            border: `1px solid ${theme.tableBorder}`,
            backgroundColor: theme.tableBackground,
            minWidth: 64,
          }}
        >
          <Text style={{ fontSize: 18 }}>{preset.icon}</Text>
          <Text style={{ fontSize: 11, color: theme.pageText, fontWeight: 500 }}>
            {preset.label}
          </Text>
          {preset.amount != null && (
            <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
              {formatCents(preset.amount)} €
            </Text>
          )}
        </Button>
      ))}
    </View>
  );
}
