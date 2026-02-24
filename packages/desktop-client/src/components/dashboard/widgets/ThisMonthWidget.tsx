// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { envelopeBudget } from '@desktop-client/spreadsheet/bindings';

import type { ContractSummary } from '@/components/dashboard/types';
import { formatEur } from '@/components/dashboard/utils';

type RowProps = {
  label: string;
  value: string;
  valueStyle?: React.CSSProperties;
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
      <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          ...valueStyle,
        }}
      >
        {value}
      </Text>
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

  // Read income and spending from Actual's envelope budget spreadsheet.
  // Requires <SheetNameProvider> wrapping this component (set in DashboardPage).
  const incomeCents = useSheetValue<'envelope-budget', 'total-income'>(
    envelopeBudget.totalIncome,
  );
  const spentCents = useSheetValue<'envelope-budget', 'total-spent'>(
    envelopeBudget.totalSpent,
  );

  const availableCents =
    incomeCents !== null && fixedMonthlyCents !== null
      ? incomeCents - fixedMonthlyCents
      : null;

  return (
    <WidgetCard title={t('This Month')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          <Trans>Loading…</Trans>
        </Text>
      ) : (
        <>
          <Row
            label={t('Income')}
            value={formatEur(incomeCents)}
            valueStyle={{ color: theme.noticeText }}
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
