// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { formatEur } from '@desktop-client/utils/german-format';

import type { UpcomingPayment } from '@/components/dashboard/types';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

type Props = {
  grouped: Map<string, UpcomingPayment[]>;
  loading: boolean;
  error: string | null;
};

export function UpcomingPaymentsWidget({ grouped, loading, error }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <WidgetCard title={t('Upcoming Payments')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          <Trans>Loading…</Trans>
        </Text>
      ) : error ? (
        <Text style={{ color: theme.errorText ?? '#ef4444', fontSize: 13 }}>
          {error}
        </Text>
      ) : grouped.size === 0 ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('No upcoming payments in the next 14 days.')}
        </Text>
      ) : (
        <View>
          {Array.from(grouped.entries()).map(([date, payments]) => (
            <View key={date} style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: theme.tableHeaderText,
                  marginBottom: 4,
                }}
              >
                {formatDate(date)}
              </Text>
              {payments.map(p => (
                <button
                  key={`${date}-${p.contractId}`}
                  onClick={() => navigate(`/contracts/${p.contractId}`)}
                  aria-label={`${p.name} – ${formatEur(p.amount)}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                  }}
                >
                  <Text style={{ color: theme.pageText, fontSize: 13 }}>
                    {p.name}
                  </Text>
                  <Text
                    style={{
                      color: theme.pageTextSubdued,
                      fontSize: 13,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    -{formatEur(p.amount)}
                  </Text>
                </button>
              ))}
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}
