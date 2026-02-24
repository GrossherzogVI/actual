import { useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { UpcomingPayment } from '../types';

type OpsSnapshot = {
  pendingReviews: number;
  expiringContracts: number;
};

type MoneyPulseData = {
  count: number;
  total: number;
  thisWeek: UpcomingPayment[];
  ops: OpsSnapshot | null;
};

export function useMoneyPulse(
  upcomingPayments: UpcomingPayment[],
): MoneyPulseData {
  const [ops, setOps] = useState<OpsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    send('workflow-money-pulse')
      .then(data => {
        if (!cancelled && data && !('error' in data)) {
          setOps(data as OpsSnapshot);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  return { count, total, thisWeek, ops };
}
