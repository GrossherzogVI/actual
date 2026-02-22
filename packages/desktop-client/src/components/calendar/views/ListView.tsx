// @ts-strict-ignore
import React, { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { SkeletonList } from '@desktop-client/components/common/Skeleton';
import { WeekGroup } from '../WeekGroup';
import type { CalendarEntry, WeekData } from '../types';

interface Props {
  weeks: WeekData[];
  allEntries: CalendarEntry[];
  loading: boolean;
  error: string | null;
  balanceThreshold?: number | null;
}

function formatCurrency(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toFixed(2);
  return cents < 0 ? `-€${formatted}` : `€${formatted}`;
}

export function ListView({ weeks, allEntries, loading, error, balanceThreshold }: Props) {
  const { t } = useTranslation();

  const summary = useMemo(() => {
    const totalDue = allEntries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
    const totalIncome = allEntries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    return { totalDue, totalIncome };
  }, [allEntries]);

  if (loading) {
    return (
      <View style={{ padding: '16px 20px' }}>
        <SkeletonList count={8} />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={{
          padding: '10px 14px',
          marginBottom: 16,
          backgroundColor: `${theme.errorText}15`,
          borderRadius: 4,
          border: `1px solid ${theme.errorText}40`,
        }}
      >
        <Text style={{ color: theme.errorText, fontSize: 13 }}>{error}</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Period summary bar */}
      <View
        style={{
          flexDirection: 'row',
          gap: 24,
          padding: '10px 14px',
          marginBottom: 16,
          backgroundColor: theme.tableBackground,
          borderRadius: 6,
          border: `1px solid ${theme.tableBorder}`,
          flexWrap: 'wrap',
        }}
      >
        <View>
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 2 }}>
            <Trans>Total due</Trans>
          </Text>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.errorText }}>
            {formatCurrency(summary.totalDue)}
          </Text>
        </View>

        {summary.totalIncome !== 0 && (
          <View>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 2 }}>
              <Trans>Income expected</Trans>
            </Text>
            <Text style={{ fontSize: 15, fontWeight: 600, color: '#10b981' }}>
              {formatCurrency(summary.totalIncome)}
            </Text>
          </View>
        )}

        <View>
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 2 }}>
            <Trans>Payments</Trans>
          </Text>
          <Text style={{ fontSize: 15, fontWeight: 600, color: theme.pageText }}>
            {allEntries.length}
          </Text>
        </View>
      </View>

      {/* Week groups */}
      {weeks.length === 0 ? (
        <View
          style={{
            padding: 30,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: theme.pageTextSubdued, fontSize: 14 }}>
            <Trans>No upcoming payments.</Trans>
          </Text>
          <Text
            style={{
              color: theme.pageTextSubdued,
              fontSize: 12,
              marginTop: 6,
            }}
          >
            <Trans>Add contracts to see them here.</Trans>
          </Text>
        </View>
      ) : (
        weeks.map(week => (
          <WeekGroup key={week.weekStart} week={week} balanceThreshold={balanceThreshold} />
        ))
      )}
    </View>
  );
}
