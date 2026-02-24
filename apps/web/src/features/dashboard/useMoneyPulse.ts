import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getDashboardPulse,
  getThisMonth,
  getUserPref,
  setUserPref,
} from '../../core/api/finance-api';

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const DISMISSED_KEY = 'money-pulse-dismissed-date';

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildLines(
  pulse: Awaited<ReturnType<typeof getDashboardPulse>> | undefined,
  thisMonth: Awaited<ReturnType<typeof getThisMonth>> | undefined,
): string[] {
  const lines: string[] = [];

  if (pulse) {
    lines.push(`Dein Kontostand beträgt ${EUR.format(pulse.total_balance)}`);

    if (pulse.pending_reviews > 0) {
      lines.push(
        `${pulse.pending_reviews} ${pulse.pending_reviews === 1 ? 'Prüfung wartet' : 'Prüfungen warten'} auf dich`,
      );
    }

    const expiring = pulse.upcoming_payments?.length ?? 0;
    if (expiring > 0) {
      lines.push(
        `${expiring} ${expiring === 1 ? 'Vertrag läuft' : 'Verträge laufen'} bald aus`,
      );
    }
  }

  if (thisMonth) {
    const net = thisMonth.net;
    if (net > 0) {
      lines.push(`Diesen Monat plus ${EUR.format(net)}`);
    } else if (net < 0) {
      lines.push(`Diesen Monat minus ${EUR.format(Math.abs(net))}`);
    }
  }

  // Ensure at least one line even with no data
  if (lines.length === 0) {
    lines.push('Willkommen zurück im Finance OS');
  }

  return lines.slice(0, 3);
}

export function useMoneyPulse() {
  const queryClient = useQueryClient();

  const { data: pulse, isLoading: pulseLoading } = useQuery({
    queryKey: ['dashboard-pulse'],
    queryFn: getDashboardPulse,
  });

  const { data: thisMonth, isLoading: monthLoading } = useQuery({
    queryKey: ['this-month'],
    queryFn: getThisMonth,
  });

  const { data: dismissedDate, isLoading: prefLoading } = useQuery({
    queryKey: ['user-pref', DISMISSED_KEY],
    queryFn: () => getUserPref(DISMISSED_KEY),
  });

  const { mutate: dismiss } = useMutation({
    mutationFn: () => setUserPref(DISMISSED_KEY, todayDateString()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-pref', DISMISSED_KEY] });
    },
  });

  const isDismissed = dismissedDate === todayDateString();
  const isLoading = pulseLoading || monthLoading || prefLoading;
  const lines = buildLines(pulse, thisMonth);

  return { lines, isDismissed, dismiss, isLoading };
}
