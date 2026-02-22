// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useContractSummary } from './hooks/useContractSummary';
import { CONTRACT_STATUS_COLORS, CONTRACT_TYPE_COLORS, formatAmountEur } from './types';
import type { CostView } from './ContractsPage';

function StatBlock({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text
        style={{
          fontSize: 11,
          color: theme.pageTextSubdued,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 2,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: color ?? theme.pageText,
          lineHeight: 1.2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function PillGroup({
  title,
  entries,
  colorMap,
}: {
  title: string;
  entries: [string, number][];
  colorMap: Record<string, string>;
}) {
  if (entries.length === 0) return null;
  return (
    <View style={{ marginTop: 8 }}>
      <Text
        style={{
          fontSize: 11,
          color: theme.pageTextSubdued,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: 4,
        }}
      >
        {title}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {entries.map(([key, count]) => (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 10,
              backgroundColor: `${colorMap[key] ?? '#6b7280'}20`,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: colorMap[key] ?? '#6b7280',
                textTransform: 'capitalize',
              }}
            >
              {key}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: colorMap[key] ?? '#6b7280',
                fontWeight: 700,
              }}
            >
              {count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ContractSummaryCard({ costView = 'monthly' }: { costView?: CostView }) {
  const { t } = useTranslation();
  const { summary, loading } = useContractSummary();

  if (loading || !summary) {
    return (
      <View
        style={{
          backgroundColor: theme.cardBackground,
          borderRadius: 8,
          border: `1px solid ${theme.cardBorder}`,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {loading ? t('Loading summary...') : t('No summary available')}
        </Text>
      </View>
    );
  }

  const byTypeEntries = Object.entries(summary.by_type ?? {}).filter(([, v]) => v > 0);
  const byStatusEntries = Object.entries(summary.by_status ?? {}).filter(([, v]) => v > 0);

  return (
    <View
      style={{
        backgroundColor: theme.cardBackground,
        borderRadius: 8,
        border: `1px solid ${theme.cardBorder}`,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: theme.pageTextSubdued,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 12,
        }}
      >
        <Trans>Commitment Overview</Trans>
      </Text>

      <View style={{ flexDirection: 'row', gap: 32, flexWrap: 'wrap' }}>
        <StatBlock
          label={costView === 'monthly' ? t('Monthly cost') : t('Annual cost')}
          value={`€${formatAmountEur(costView === 'monthly' ? summary.total_monthly : summary.total_annual)}`}
          color={theme.pageTextDark}
        />
        <StatBlock
          label={costView === 'monthly' ? t('Annual cost') : t('Monthly cost')}
          value={`€${formatAmountEur(costView === 'monthly' ? summary.total_annual : summary.total_monthly)}`}
        />
      </View>

      <PillGroup
        title={t('By status')}
        entries={byStatusEntries}
        colorMap={CONTRACT_STATUS_COLORS}
      />
      <PillGroup
        title={t('By type')}
        entries={byTypeEntries}
        colorMap={CONTRACT_TYPE_COLORS}
      />
    </View>
  );
}
