// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

interface Props {
  balance: number; // cents
  /** Monthly income estimate (cents) — used to determine "yellow zone" threshold */
  monthlyIncome?: number;
  /** User-configured minimum balance threshold in cents (from balanceThreshold pref).
   *  When provided: bar turns red below this value. Also renders a threshold marker. */
  threshold?: number | null;
}

function getBarColor(balance: number, redThreshold: number | null, yellowThreshold: number): string {
  if (balance < 0) return theme.errorText;
  if (redThreshold !== null && balance < redThreshold) return theme.errorText;
  if (balance < yellowThreshold) return theme.warningText;
  return '#10b981'; // green
}

function formatBalance(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toFixed(2);
  return cents < 0 ? `-€${formatted}` : `€${formatted}`;
}

export function BalanceProjectionLine({
  balance,
  monthlyIncome = 300000,
  threshold = null,
}: Props) {
  const { t } = useTranslation();

  // Yellow zone = less than 30% of monthly income (original behavior)
  const yellowThreshold = Math.round(monthlyIncome * 0.3);
  const barColor = getBarColor(balance, threshold, yellowThreshold);

  // Bar fill: clamp to [0, 100]% relative to 2x monthly income
  const maxDisplay = monthlyIncome * 2;
  const fillPct =
    balance <= 0 ? 0 : Math.min(100, Math.round((balance / maxDisplay) * 100));

  // Threshold marker position as percentage of maxDisplay
  const thresholdPct =
    threshold !== null && threshold > 0
      ? Math.min(100, Math.round((threshold / maxDisplay) * 100))
      : null;

  const isBelowThreshold = threshold !== null && balance < threshold;

  const label =
    balance < 0
      ? t('Overdrawn')
      : isBelowThreshold
        ? t('Below minimum')
        : balance < yellowThreshold
          ? t('Low balance')
          : t('Healthy');

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
      }}
    >
      <Text
        style={{
          fontSize: 11,
          color: theme.pageTextSubdued,
          flexShrink: 0,
          width: 80,
        }}
      >
        {t('Balance')}
      </Text>

      {/* Bar track */}
      <View
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.tableBorder,
          overflow: 'visible',
          position: 'relative',
        }}
      >
        {/* Fill */}
        <View
          style={{
            width: `${fillPct}%`,
            height: '100%',
            backgroundColor: barColor,
            borderRadius: 3,
            transition: 'width 0.3s ease',
          }}
        />

        {/* Threshold marker line */}
        {thresholdPct !== null && (
          <View
            style={{
              position: 'absolute',
              left: `${thresholdPct}%`,
              top: -3,
              bottom: -3,
              width: 2,
              backgroundColor: theme.errorText,
              borderRadius: 1,
              opacity: 0.7,
            }}
          />
        )}
      </View>

      <Text
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: barColor,
          flexShrink: 0,
          minWidth: 70,
          textAlign: 'right',
        }}
      >
        {formatBalance(balance)}
      </Text>

      <Text
        style={{
          fontSize: 10,
          color: barColor,
          flexShrink: 0,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
