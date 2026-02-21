// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

import type { ImportCommitResult } from './types';

type Props = {
  result: ImportCommitResult;
  onReset: () => void;
};

export function ImportAdvisor({ result, onReset }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const needsReview = result.imported - (result.imported - result.skipped);
  // Approximate: rows without categories need review
  const uncategorized = Math.max(0, result.imported - Math.floor(result.imported * 0.8));

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 24,
        padding: '40px 20px',
      }}
    >
      {/* Success icon */}
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: '#10b98120',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
        }}
      >
        <span>✓</span>
      </View>

      {/* Title */}
      <Text
        style={{ fontSize: 20, fontWeight: 600, color: theme.pageText, textAlign: 'center' }}
      >
        <Trans>Import Complete</Trans>
      </Text>

      {/* Stats */}
      <View
        style={{
          flexDirection: 'row',
          gap: 24,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <StatCard
          label={t('Imported')}
          value={result.imported}
          color='#10b981'
        />
        <StatCard
          label={t('Skipped')}
          value={result.skipped}
          color={theme.pageTextSubdued}
        />
        {result.contracts_detected > 0 && (
          <StatCard
            label={t('Contracts detected')}
            value={result.contracts_detected}
            color='#3b82f6'
          />
        )}
      </View>

      {/* Message */}
      <View
        style={{
          backgroundColor: theme.tableBackground,
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 8,
          padding: '14px 20px',
          maxWidth: 440,
          textAlign: 'center',
        }}
      >
        <Text style={{ fontSize: 14, color: theme.pageText, lineHeight: '1.5' }}>
          {t(
            '{{imported}} transactions imported. {{skipped}} skipped (duplicates or errors). Check the Review Queue for any items that need attention.',
            {
              imported: result.imported,
              skipped: result.skipped,
            },
          )}
        </Text>
      </View>

      {/* CTAs */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Button variant="primary" onPress={() => void navigate('/review')}>
          <Trans>Go to Review Queue</Trans>
        </Button>
        <Button variant="normal" onPress={() => void navigate('/accounts')}>
          <Trans>View Transactions</Trans>
        </Button>
        <Button variant="bare" onPress={onReset}>
          <Trans>Import More</Trans>
        </Button>
      </View>
    </View>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        backgroundColor: theme.tableBackground,
        border: `1px solid ${theme.tableBorder}`,
        borderRadius: 8,
        padding: '12px 20px',
        minWidth: 100,
      }}
    >
      <Text style={{ fontSize: 28, fontWeight: 700, color }}>{value}</Text>
      <Text style={{ fontSize: 12, color: theme.pageTextSubdued, marginTop: 4 }}>
        {label}
      </Text>
    </View>
  );
}
