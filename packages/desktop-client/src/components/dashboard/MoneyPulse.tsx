// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import type { UpcomingPayment } from './types';

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
  const [dismissedDate, setDismissedDate] = useSyncedPref(
    'moneyPulseDismissedDate',
  );

  if (dismissedDate === getTodayISO()) return null;

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
