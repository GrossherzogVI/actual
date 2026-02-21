// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { CategoryMapping } from './types';

type Props = {
  mappings: CategoryMapping[];
  matchedCount: number;
  internalCategories: Array<{ id: string; name: string }>;
  onUpdate: (external: string, internalId: string | null) => void;
  onAutoMatch: () => void;
};

export function CategoryMapper({
  mappings,
  matchedCount,
  internalCategories,
  onUpdate,
  onAutoMatch,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={{ gap: 12 }}>
      {/* Header row */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
          {t('{{matched}} of {{total}} categories mapped', {
            matched: matchedCount,
            total: mappings.length,
          })}
        </Text>
        <Button variant="bare" onPress={onAutoMatch}>
          <Trans>Auto-match</Trans>
        </Button>
      </View>

      {/* Column labels */}
      <View
        style={{
          flexDirection: 'row',
          padding: '6px 12px',
          backgroundColor: theme.tableHeaderBackground,
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
          color: theme.tableHeaderText,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: 600, color: theme.tableHeaderText }}>
            <Trans>External Category</Trans>
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: 600, color: theme.tableHeaderText }}>
            <Trans>Actual Category</Trans>
          </Text>
        </View>
      </View>

      {/* Mapping rows */}
      <View
        style={{
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {mappings.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
              <Trans>No external categories found in this file.</Trans>
            </Text>
          </View>
        ) : (
          mappings.map((mapping, i) => (
            <View
              key={mapping.external}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: '9px 12px',
                borderBottom:
                  i < mappings.length - 1 ? `1px solid ${theme.tableBorder}` : 'none',
                backgroundColor:
                  mapping.internal_id ? theme.tableBackground : `${theme.warningText}08`,
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: theme.pageText,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mapping.external}
                </Text>
                {mapping.auto_matched && (
                  <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                    <Trans>auto-matched</Trans>
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <select
                  value={mapping.internal_id ?? ''}
                  onChange={e =>
                    onUpdate(mapping.external, e.target.value || null)
                  }
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    fontSize: 13,
                    borderRadius: 4,
                    border: `1px solid ${theme.tableBorder}`,
                    backgroundColor: theme.tableBackground,
                    color: theme.pageText,
                    outline: 'none',
                  }}
                >
                  <option value="">{t('— skip —')}</option>
                  {internalCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}
