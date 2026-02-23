// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import type { CostView } from './ContractsPage';
import { useContractSummary } from './hooks/useContractSummary';
import {
  CONTRACT_STATUS_COLORS,
  CONTRACT_TYPE_COLORS,
  formatAmountEur,
} from './types';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function StatBlock({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
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
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([key, count]) => (
          <Badge key={key} variant="outline" className="gap-1.5 capitalize">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: colorMap[key] ?? '#6b7280' }}
            />
            {key}
            <span className="font-bold">{count}</span>
          </Badge>
        ))}
      </div>
    </View>
  );
}

export function ContractSummaryCard({
  costView = 'monthly',
}: {
  costView?: CostView;
}) {
  const { t } = useTranslation();
  const { summary, loading } = useContractSummary();

  if (loading || !summary) {
    return (
      <Card className="mb-4">
        <CardContent>
          <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
            {loading ? t('Loading summary...') : t('No summary available')}
          </Text>
        </CardContent>
      </Card>
    );
  }

  const byTypeEntries = Object.entries(summary.by_type ?? {}).filter(
    ([, v]) => v > 0,
  );
  const byStatusEntries = Object.entries(summary.by_status ?? {}).filter(
    ([, v]) => v > 0,
  );

  return (
    <Card className="mb-4">
      <CardHeader className="pb-0">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground">
          <Trans>Commitment Overview</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <View style={{ flexDirection: 'row', gap: 32, flexWrap: 'wrap' }}>
          <StatBlock
            label={
              costView === 'monthly' ? t('Monthly cost') : t('Annual cost')
            }
            value={`€${formatAmountEur(costView === 'monthly' ? summary.total_monthly : summary.total_annual)}`}
            color={theme.pageTextDark}
          />
          <StatBlock
            label={
              costView === 'monthly' ? t('Annual cost') : t('Monthly cost')
            }
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
      </CardContent>
    </Card>
  );
}
