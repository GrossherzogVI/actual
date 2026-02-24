// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { UpcomingPayment } from './types';
import { useMoneyPulse } from './hooks/useMoneyPulse';

import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
import { formatEur } from '@desktop-client/utils/german-format';

import { Card, CardContent } from '@/components/ui/card';

type Props = {
  upcomingPayments: UpcomingPayment[];
};

function getTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function MoneyPulse({ upcomingPayments }: Props) {
  const { t } = useTranslation();
  const { count, total, ops } = useMoneyPulse(upcomingPayments);
  const [dismissedDate, setDismissedDate] = useSyncedPref(
    'moneyPulseDismissedDate',
  );

  if (dismissedDate === getTodayISO()) return null;

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
          onClick={() => setDismissedDate(getTodayISO())}
          className="cursor-pointer border-none bg-transparent pl-3 text-lg leading-none text-muted-foreground hover:text-foreground"
          aria-label={t('Dismiss')}
        >
          &times;
        </button>
      </CardContent>
    </Card>
  );
}
