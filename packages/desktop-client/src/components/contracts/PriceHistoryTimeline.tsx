import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { formatAmountEur } from './types';
import type { PriceHistoryItem } from './types';

type PriceHistoryTimelineProps = {
  items: PriceHistoryItem[];
};

const DETECTED_BY_LABELS: Record<string, string> = {
  user: 'User',
  ai: 'AI',
  import: 'Import',
};

function PriceChange({ isIncrease }: { isIncrease: boolean }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: isIncrease ? theme.errorText : theme.pageTextPositive,
        marginLeft: 4,
      }}
    >
      {isIncrease ? '▲' : '▼'}
    </Text>
  );
}

function TimelineItem({ item, isLast }: { item: PriceHistoryItem; isLast: boolean }) {
  const { t } = useTranslation();
  const isIncrease = item.new_amount > item.old_amount;
  const diffCents = item.new_amount - item.old_amount;
  const diffDisplay =
    diffCents > 0
      ? `+${formatAmountEur(diffCents)}`
      : formatAmountEur(diffCents);

  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {/* Timeline spine */}
      <View style={{ alignItems: 'center', width: 20, flexShrink: 0 }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: isIncrease ? theme.errorText : theme.pageTextPositive,
            marginTop: 4,
            flexShrink: 0,
          }}
        />
        {!isLast && (
          <View
            style={{
              width: 2,
              flex: 1,
              backgroundColor: theme.tableBorder,
              marginTop: 2,
              minHeight: 24,
            }}
          />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
            {formatAmountEur(item.old_amount)}
          </Text>
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued, margin: '0 2px' }}>→</Text>
          <Text style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
            {formatAmountEur(item.new_amount)}
          </Text>
          <PriceChange isIncrease={isIncrease} />
          <Text
            style={{
              fontSize: 11,
              color: isIncrease ? theme.errorText : theme.pageTextPositive,
              marginLeft: 2,
            }}
          >
            ({diffDisplay})
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
            {item.change_date}
          </Text>
          {item.detected_by && (
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              <Trans>Detected by</Trans>:{' '}
              {t(DETECTED_BY_LABELS[item.detected_by] ?? item.detected_by)}
            </Text>
          )}
          {item.reason && (
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {item.reason}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function PriceHistoryTimeline({ items }: PriceHistoryTimelineProps) {
  const { t } = useTranslation();

  if (!items || items.length === 0) {
    return (
      <View style={{ padding: '20px 0' }}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('No price history recorded.')}
        </Text>
      </View>
    );
  }

  // Show most recent first
  const sorted = [...items].sort(
    (a, b) => new Date(b.change_date).getTime() - new Date(a.change_date).getTime(),
  );

  return (
    <View style={{ padding: '8px 0' }}>
      {sorted.map((item, index) => (
        <TimelineItem key={item.id} item={item} isLast={index === sorted.length - 1} />
      ))}
    </View>
  );
}
