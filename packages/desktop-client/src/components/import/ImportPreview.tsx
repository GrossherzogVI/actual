// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { ImportPreviewRow } from './types';

type Props = {
  rows: ImportPreviewRow[];
  total: number;
  categoryNames?: Record<string, string>; // category_id -> display name
};

const PREVIEW_LIMIT = 50;

function AmountCell({ amount }: { amount: number }) {
  const formatted = (amount / 100).toFixed(2);
  const isNegative = amount < 0;
  return (
    <Text
      style={{
        fontSize: 13,
        color: isNegative ? '#ef4444' : '#10b981',
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
        minWidth: 80,
      }}
    >
      {isNegative ? '' : '+'}
      {formatted}
    </Text>
  );
}

export function ImportPreview({ rows, total, categoryNames = {} }: Props) {
  const { t } = useTranslation();

  const displayed = rows.slice(0, PREVIEW_LIMIT);
  const categorizedCount = rows.filter(r => r.suggested_category_id).length;

  return (
    <View style={{ gap: 10 }}>
      {/* Summary bar */}
      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          flexWrap: 'wrap',
          padding: '8px 0',
        }}
      >
        <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
          {t('{{total}} transactions total', { total })}
        </Text>
        <Text style={{ fontSize: 13, color: '#10b981' }}>
          {t('{{n}} categorized', { n: categorizedCount })}
        </Text>
        {total > PREVIEW_LIMIT && (
          <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
            {t('Showing first {{n}}', { n: PREVIEW_LIMIT })}
          </Text>
        )}
      </View>

      {/* Table */}
      <View
        style={{
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            padding: '7px 12px',
            backgroundColor: theme.tableHeaderBackground,
            borderBottom: `1px solid ${theme.tableBorder}`,
            gap: 8,
          }}
        >
          {['Date', 'Payee', 'Amount', 'Category', 'Status'].map(label => (
            <Text
              key={label}
              style={{
                flex: label === 'Payee' ? 2 : 1,
                fontSize: 11,
                fontWeight: 600,
                color: theme.tableHeaderText,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {t(label)}
            </Text>
          ))}
        </View>

        {/* Rows */}
        {displayed.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              <Trans>No rows to preview.</Trans>
            </Text>
          </View>
        ) : (
          displayed.map((row, i) => {
            const hasCat = Boolean(row.suggested_category_id);
            const catName = row.suggested_category_id
              ? (categoryNames[row.suggested_category_id] ?? row.suggested_category_id)
              : null;
            return (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderBottom:
                    i < displayed.length - 1
                      ? `1px solid ${theme.tableBorder}`
                      : 'none',
                  backgroundColor: hasCat
                    ? theme.tableBackground
                    : `${theme.warningText}08`,
                  gap: 8,
                }}
              >
                {/* Date */}
                <Text
                  style={{ flex: 1, fontSize: 13, color: theme.pageText }}
                >
                  {row.date}
                </Text>
                {/* Payee */}
                <Text
                  style={{
                    flex: 2,
                    fontSize: 13,
                    color: theme.pageText,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.payee}
                </Text>
                {/* Amount */}
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <AmountCell amount={row.amount} />
                </View>
                {/* Category */}
                <Text
                  style={{
                    flex: 1,
                    fontSize: 12,
                    color: hasCat ? theme.pageText : theme.pageTextSubdued,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {catName ?? t('— uncategorized —')}
                </Text>
                {/* Status */}
                <View style={{ flex: 1, overflow: 'hidden' }}>
                  <Text
                    style={{
                      fontSize: 11,
                      color: hasCat ? '#10b981' : '#f59e0b',
                      fontWeight: 500,
                    }}
                  >
                    {hasCat ? t('Ready') : t('No category')}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}
