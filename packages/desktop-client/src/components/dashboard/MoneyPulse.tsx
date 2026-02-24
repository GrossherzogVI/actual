// @ts-strict-ignore
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { send } from 'loot-core/platform/client/connection';

import type { UpcomingPayment } from './types';

import { Card, CardContent } from '@/components/ui/card';

function formatEur(cents: number | null): string {
  if (cents == null) return '\u2014';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

type OpsSnapshot = {
  pendingReviews: number;
  expiringContracts: number;
};

type Props = {
  upcomingPayments: UpcomingPayment[];
};

export function MoneyPulse({ upcomingPayments }: Props) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [ops, setOps] = useState<OpsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    send('workflow-money-pulse')
      .then(data => {
        if (!cancelled && data && !('error' in data)) {
          setOps(data as unknown as OpsSnapshot);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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

  // Build pulse segments
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
    segments.push(t('{{n}} contract(s) expiring soon', { n: ops.expiringContracts }));
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
