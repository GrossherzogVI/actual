// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

export function QuickAddWidget() {
  const { t } = useTranslation();

  return (
    <WidgetCard title={t('Quick Add')}>
      <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13, textAlign: 'center' }}>
          {t('Use')}
        </Text>
        <View
          style={{
            backgroundColor: theme.tableHeaderBackground,
            borderRadius: 4,
            padding: '4px 10px',
            marginTop: 8,
            marginBottom: 8,
          }}
        >
          <Text style={{ fontFamily: 'monospace', fontSize: 13, color: theme.pageText }}>
            ⌘ N
          </Text>
        </View>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13, textAlign: 'center' }}>
          {t('to open the Quick Add overlay')}
        </Text>
      </View>
    </WidgetCard>
  );
}
