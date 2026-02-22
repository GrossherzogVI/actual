// @ts-strict-ignore
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { SvgCalendar } from '@actual-app/components/icons/v2';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { DeadlineBadge } from '../contracts/DeadlineBadge';
import type { CalendarEntry } from './types';

interface Props {
  entry: CalendarEntry;
  isLast?: boolean;
}

const CONTRACT_TYPE_COLORS: Record<string, string> = {
  insurance: '#6366f1',
  rent: '#f59e0b',
  utility: '#10b981',
  subscription: '#3b82f6',
  tax: '#ef4444',
  loan: '#8b5cf6',
  other: '#6b7280',
};

function formatAmount(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toFixed(2);
  return cents < 0 ? `-€${formatted}` : `+€${formatted}`;
}

function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric' });
}

function daysFromToday(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function PaymentItem({ entry, isLast = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const isExpense = entry.amount < 0;
  const amountColor = isExpense ? theme.errorText : '#10b981';

  const handleClick = useCallback(() => {
    if (entry.type === 'contract') {
      navigate(`/contracts/${entry.sourceId}`);
    }
    // Schedule navigation would go here when implemented
  }, [entry, navigate]);

  const typeColor = entry.contractType
    ? (CONTRACT_TYPE_COLORS[entry.contractType] ?? '#6b7280')
    : '#6b7280';

  return (
    <View
      onClick={handleClick}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: '7px 12px',
        borderBottom: isLast ? 'none' : `1px solid ${theme.tableBorder}`,
        cursor: 'pointer',
        gap: 10,
        ':hover': {
          backgroundColor: theme.tableRowBackgroundHover,
        },
      }}
    >
      {/* Date tag */}
      <View
        style={{
          flexShrink: 0,
          width: 52,
          fontSize: 11,
          color: theme.pageTextSubdued,
          textAlign: 'right',
        }}
      >
        <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
          {formatDayShort(entry.date)}
        </Text>
      </View>

      {/* Type icon */}
      <View style={{ flexShrink: 0, width: 18, alignItems: 'center' }}>
        {entry.type === 'schedule' ? (
          <SvgCalendar
            style={{ width: 13, height: 13, color: theme.pageTextSubdued }}
          />
        ) : (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: typeColor,
            }}
          />
        )}
      </View>

      {/* Name + account */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: theme.pageText,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.name}
        </Text>
        {(entry.accountName || entry.contractType) && (
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginTop: 1 }}>
            {entry.accountName ?? ''}
            {entry.accountName && entry.contractType ? ' · ' : ''}
            {entry.contractType ?? ''}
          </Text>
        )}
      </View>

      {/* Contract type badge */}
      {entry.contractType && (
        <View
          style={{
            flexShrink: 0,
            padding: '2px 7px',
            borderRadius: 10,
            backgroundColor: `${typeColor}20`,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: typeColor,
              textTransform: 'capitalize',
            }}
          >
            {entry.contractType}
          </Text>
        </View>
      )}

      {/* Deadline badge — shown only for non-ok statuses on contract entries */}
      {entry.type === 'contract' &&
        entry.deadlineStatus &&
        entry.deadlineStatus !== 'ok' && (
          <DeadlineBadge
            status={entry.deadlineStatus}
            compact
            daysRelative={
              entry.deadlineStatus === 'action_due' && entry.actionDeadline
                ? daysFromToday(entry.actionDeadline)
                : entry.deadlineStatus === 'soft_passed' && entry.softDeadline
                  ? daysFromToday(entry.softDeadline)
                  : entry.hardDeadline
                    ? daysFromToday(entry.hardDeadline)
                    : undefined
            }
          />
        )}

      {/* Amount */}
      <Text
        style={{
          flexShrink: 0,
          fontSize: 13,
          fontWeight: 600,
          color: amountColor,
          minWidth: 70,
          textAlign: 'right',
        }}
      >
        {formatAmount(entry.amount)}
      </Text>
    </View>
  );
}
