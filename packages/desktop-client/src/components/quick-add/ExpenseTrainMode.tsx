// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

type ExpenseTrainModeProps = {
  enabled: boolean;
  onToggle: () => void;
  entryCount: number;
  runningTotal: number; // cents
};

export function ExpenseTrainMode({
  enabled,
  onToggle,
  entryCount,
  runningTotal,
}: ExpenseTrainModeProps) {
  const { t } = useTranslation();

  const totalFormatted = (runningTotal / 100).toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px',
        borderTop: `1px solid ${theme.tableBorderSeparator}`,
        backgroundColor: enabled ? theme.menuBackground : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button
          variant="bare"
          onPress={onToggle}
          style={{
            fontSize: 11,
            padding: '3px 8px',
            borderRadius: 4,
            border: `1px solid ${enabled ? theme.formInputBorderSelected : theme.tableBorder}`,
            color: enabled ? theme.formLabelText : theme.pageTextSubdued,
            backgroundColor: enabled ? theme.menuItemBackgroundHover : 'transparent',
          }}
        >
          <Trans>Train mode</Trans>
        </Button>
        {enabled && (
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {t('Entry {{n}}', { n: entryCount })}
          </Text>
        )}
      </View>
      {enabled && entryCount > 0 && (
        <Text style={{ fontSize: 12, color: theme.pageText, fontWeight: 500 }}>
          {t('Total: {{total}}', { total: totalFormatted })}
        </Text>
      )}
    </View>
  );
}
