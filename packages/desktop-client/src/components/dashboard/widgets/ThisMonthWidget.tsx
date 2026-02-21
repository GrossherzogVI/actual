// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { ContractSummary } from '../types';
import { WidgetCard } from './WidgetCard';

function formatEur(cents: number | null): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

type RowProps = {
  label: string;
  value: string;
  valueStyle?: object;
};

function Row({ label, value, valueStyle }: RowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 8,
      }}
    >
      <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: 500, ...valueStyle }}>{value}</Text>
    </View>
  );
}

type Props = {
  summary: ContractSummary | null;
  loading: boolean;
};

export function ThisMonthWidget({ summary, loading }: Props) {
  const { t } = useTranslation();

  const fixedMonthlyCents = summary?.total_monthly ?? null;
  // Income and variable spent are placeholders until account data is wired
  const incomeCents = null;
  const spentCents = null;

  const availableCents =
    incomeCents !== null && fixedMonthlyCents !== null
      ? incomeCents - fixedMonthlyCents
      : null;

  return (
    <WidgetCard title={t('This Month')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{t('Loading…')}</Text>
      ) : (
        <>
          <Row
            label={t('Income')}
            value={formatEur(incomeCents)}
            valueStyle={{ color: '#10b981' }}
          />
          <Row label={t('Fixed costs')} value={formatEur(fixedMonthlyCents)} />
          <Row label={t('Variable spent')} value={formatEur(spentCents)} />
          <View
            style={{
              borderTop: `1px solid ${theme.tableBorder}`,
              marginTop: 4,
              paddingTop: 8,
            }}
          >
            <Row
              label={t('Available')}
              value={formatEur(availableCents)}
              valueStyle={{ fontWeight: 700 }}
            />
          </View>
        </>
      )}
    </WidgetCard>
  );
}
