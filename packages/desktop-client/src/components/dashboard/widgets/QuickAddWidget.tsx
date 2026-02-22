// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

type Props = {
  onOpenQuickAdd?: () => void;
};

export function QuickAddWidget({ onOpenQuickAdd }: Props) {
  const { t } = useTranslation();

  return (
    <WidgetCard title={t('Quick Add')}>
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
        <Button
          variant="primary"
          onPress={() => onOpenQuickAdd?.()}
          style={{ width: '100%', marginBottom: 8 }}
        >
          {t('Add Expense')}
        </Button>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 11, textAlign: 'center' }}>
          {t('or press {{shortcut}} anywhere', { shortcut: '\u2318N' })}
        </Text>
      </View>
    </WidgetCard>
  );
}
