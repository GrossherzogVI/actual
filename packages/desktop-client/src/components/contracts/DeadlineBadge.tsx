// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

type DeadlineStatusType = 'ok' | 'action_due' | 'soft_passed' | 'hard_passed';

interface Props {
  status: DeadlineStatusType;
  /** Relative days: positive = future, negative = past */
  daysRelative?: number;
  /** Show inline (no background pill) — for compact display in lists */
  compact?: boolean;
}

const STATUS_COLORS: Record<DeadlineStatusType, string> = {
  ok: theme.upcomingBackground ?? '#6b7280',
  action_due: '#3b82f6',   // blue
  soft_passed: '#f59e0b',  // yellow/amber
  hard_passed: '#ef4444',  // red
};

function formatCountdown(days: number, t: ReturnType<typeof useTranslation>['t']): string {
  if (days === 0) return t('Heute');
  if (days > 0) return t('in {{n}} Tag(en)', { n: days });
  return t('{{n}} Tag(e) überfällig', { n: Math.abs(days) });
}

/**
 * Small colored badge showing payment deadline status with optional countdown text.
 * Used in calendar list items and the contract detail page.
 */
export function DeadlineBadge({ status, daysRelative, compact = false }: Props) {
  const { t } = useTranslation();

  if (status === 'ok') return null;

  const color = STATUS_COLORS[status];

  const labelMap: Record<DeadlineStatusType, string> = {
    ok: '',
    action_due: t('Handlung fällig'),
    soft_passed: t('Zahlungsziel überschritten'),
    hard_passed: t('Letzte Frist überschritten'),
  };

  const label = labelMap[status];
  const countdown = daysRelative !== undefined ? formatCountdown(daysRelative, t) : null;

  if (compact) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: color,
            flexShrink: 0,
          }}
        />
        {countdown && (
          <Text
            style={{
              fontSize: 10,
              color,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {countdown}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View
      style={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 10,
        backgroundColor: `${color}18`,
        border: `1px solid ${color}40`,
        flexShrink: 0,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <Text style={{ fontSize: 11, fontWeight: 600, color }}>
        {label}
      </Text>
      {countdown && (
        <Text style={{ fontSize: 11, color: `${color}cc` }}>
          {countdown}
        </Text>
      )}
    </View>
  );
}
