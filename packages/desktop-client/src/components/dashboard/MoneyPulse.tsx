// @ts-strict-ignore
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { UpcomingPayment } from './types';
import { useMoneyPulse } from './hooks/useMoneyPulse';

import { Card, CardContent } from '@/components/ui/card';

function formatEur(cents: number | null): string {
  if (cents == null) return '\u2014';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

type Props = {
  upcomingPayments: UpcomingPayment[];
};

export function MoneyPulse({ upcomingPayments }: Props) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const { count, total, ops } = useMoneyPulse(upcomingPayments);

  if (dismissed) return null;

  const segments: string[] = [];

  if (count > 0) {
    segments.push(
      t('{{count}} bill(s) due this week ({{total}})', {
        count,
        total: formatEur(total),
      }),
    );
  } else {
    segments.push(t('No bills due this week'));
  }

  if (ops?.pendingReviews) {
    segments.push(t('{{n}} review(s) pending', { n: ops.pendingReviews }));
  }
  if (ops?.expiringContracts) {
    segments.push(
      t('{{n}} contract(s) expiring soon', { n: ops.expiringContracts }),
    );
  }

  const message = segments.join(' · ');

  return (
    <Card className="gap-0 border-0 bg-gradient-to-r from-primary/5 to-primary/10 py-0 shadow-none">
      <CardContent className="flex flex-row items-center justify-between px-4 py-2.5">
        <span className="text-[13px] text-foreground">{message}</span>
        <button
          onClick={() => setDismissed(true)}
          className="cursor-pointer border-none bg-transparent pl-3 text-lg leading-none text-muted-foreground hover:text-foreground"
          aria-label={t('Dismiss')}
        >
          &times;
        </button>
      </CardContent>
    </Card>
  );
}
