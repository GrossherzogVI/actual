// @ts-strict-ignore
import React from 'react';
import { Trans } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { RecentTemplate } from './types';

type RecentTemplatesProps = {
  templates: RecentTemplate[];
  onSelect: (template: RecentTemplate) => void;
};

export function RecentTemplates({ templates, onSelect }: RecentTemplatesProps) {
  return (
    <View
      style={{
        padding: '8px 16px',
        borderTop: `1px solid ${theme.tableBorderSeparator}`,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: theme.pageTextSubdued,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 6,
        }}
      >
        <Trans>Recent</Trans>
      </Text>
      {templates.length === 0 ? (
        <Text style={{ fontSize: 13, color: theme.pageTextSubdued, fontStyle: 'italic' }}>
          <Trans>Recent transactions coming soon</Trans>
        </Text>
      ) : (
        templates.slice(0, 5).map((tpl, i) => (
          <View
            key={i}
            role="button"
            onMouseDown={() => onSelect(tpl)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '5px 0',
              cursor: 'pointer',
              borderBottom: i < templates.length - 1 ? `1px solid ${theme.tableBorder}` : 'none',
            }}
          >
            <View style={{ flexDirection: 'column', flex: 1 }}>
              <Text style={{ fontSize: 13, color: theme.pageText }}>{tpl.payee || '—'}</Text>
              <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>{tpl.categoryName}</Text>
            </View>
            <Text style={{ fontSize: 13, color: theme.pageText, fontWeight: 500 }}>
              {(tpl.amount / 100).toLocaleString('de-DE', {
                style: 'currency',
                currency: 'EUR',
              })}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
