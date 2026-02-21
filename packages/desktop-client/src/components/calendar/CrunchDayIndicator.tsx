// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';
import { SvgAlertTriangle } from '@actual-app/components/icons/v2';

interface Props {
  paymentCount: number;
  totalCents: number;
}

const CRUNCH_PAYMENT_COUNT = 3;
const CRUNCH_AMOUNT_CENTS = 50000; // 500€

export function isCrunchDay(paymentCount: number, totalCents: number): boolean {
  return paymentCount >= CRUNCH_PAYMENT_COUNT || Math.abs(totalCents) >= CRUNCH_AMOUNT_CENTS;
}

export function CrunchDayIndicator({ paymentCount, totalCents }: Props) {
  const { t } = useTranslation();

  const reasons: string[] = [];
  if (paymentCount >= CRUNCH_PAYMENT_COUNT) {
    reasons.push(t('{{count}} payments due', { count: paymentCount }));
  }
  if (Math.abs(totalCents) >= CRUNCH_AMOUNT_CENTS) {
    const euros = (Math.abs(totalCents) / 100).toFixed(0);
    reasons.push(t('€{{amount}} total', { amount: euros }));
  }

  const tooltipContent = t('Heavy payment day: {{reasons}}', {
    reasons: reasons.join(', '),
  });

  return (
    <Tooltip content={tooltipContent}>
      <View
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: '50%',
          backgroundColor: `${theme.warningText}20`,
          cursor: 'default',
          flexShrink: 0,
        }}
      >
        <SvgAlertTriangle
          style={{
            width: 11,
            height: 11,
            color: theme.warningText,
          }}
        />
      </View>
    </Tooltip>
  );
}
