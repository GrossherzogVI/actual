// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

import type { UpcomingPayment } from '../types';
import { WidgetCard } from './WidgetCard';

function formatEur(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', month: 'short', day: 'numeric' });
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
    <WidgetCard title={t('Upcoming Payments')} style={{ gridColumn: '1 / -1' }}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{t('Loading…')}</Text>
      ) : error ? (
        <Text style={{ color: theme.errorText ?? '#ef4444', fontSize: 13 }}>{error}</Text>
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
                <View
                  key={`${date}-${p.contractId}`}
                  onClick={() => navigate(`/contracts/${p.contractId}`)}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '4px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                  // Hover styling handled via CSS; inline only for base state
                >
                  <Text style={{ color: theme.pageText, fontSize: 13 }}>{p.name}</Text>
                  <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
                    -{formatEur(p.amount)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </WidgetCard>
  );
}
