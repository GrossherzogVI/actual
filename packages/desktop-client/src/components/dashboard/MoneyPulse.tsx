// @ts-strict-ignore
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { UpcomingPayment } from './types';

function formatEur(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

type Props = {
  upcomingPayments: UpcomingPayment[];
};

export function MoneyPulse({ upcomingPayments }: Props) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // Compute bills due in next 7 days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDays = new Date(today);
  sevenDays.setDate(sevenDays.getDate() + 7);

  const thisWeek = upcomingPayments.filter(p => {
    const d = new Date(p.date);
    return d >= today && d <= sevenDays;
  });

  const total = thisWeek.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const count = thisWeek.length;

  const message =
    count > 0
      ? t('You have {{count}} bill(s) due this week, totalling {{total}}.', {
          count,
          total: formatEur(total),
        })
      : t('No bills due in the next 7 days. Looking good!');

  return (
    <View
      style={{
        backgroundColor: theme.pageBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 8,
        padding: '10px 16px',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gridColumn: '1 / -1',
      }}
    >
      <Text style={{ color: theme.pageText, fontSize: 13 }}>{message}</Text>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: theme.pageTextSubdued,
          fontSize: 18,
          lineHeight: 1,
          padding: '0 0 0 12px',
        }}
        aria-label={t('Dismiss')}
      >
        ×
      </button>
    </View>
  );
}
