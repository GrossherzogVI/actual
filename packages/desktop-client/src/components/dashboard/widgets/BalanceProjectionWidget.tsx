// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

export function BalanceProjectionWidget() {
  const { t } = useTranslation();

  return (
    <WidgetCard title={t('Balance Projection')} style={{ gridColumn: '1 / -1' }}>
      <View style={{ alignItems: 'center', padding: '24px 0' }}>
        <Text style={{ fontSize: 32, color: theme.pageTextSubdued, marginBottom: 8 }}>
          📈
        </Text>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Balance projection coming soon. Requires schedule + account integration.')}
        </Text>
      </View>
    </WidgetCard>
  );
}
