// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

// Placeholder — real account data requires loot-core account query integration.
// This widget is included for layout completeness; data wired in a later phase.

export function AccountBalancesWidget() {
  const { t } = useTranslation();

  return (
    <WidgetCard title={t('Account Balances')}>
      <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
        {t('Account balances will appear here once bank sync is configured.')}
      </Text>
    </WidgetCard>
  );
}
