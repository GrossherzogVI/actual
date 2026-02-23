// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import type { ReviewItem } from './types';

type ReviewBatchActionsProps = {
  items: ReviewItem[];
  onAcceptHighConfidence: () => void;
  onDismissAllSuggestions: () => void;
};

export function ReviewBatchActions({
  items,
  onAcceptHighConfidence,
  onDismissAllSuggestions,
}: ReviewBatchActionsProps) {
  const { t } = useTranslation();

  const pendingItems = items.filter(i => i.status === 'pending');
  const highConfidenceCount = pendingItems.filter(
    i => i.ai_confidence != null && i.ai_confidence >= 0.9,
  ).length;
  const suggestionCount = pendingItems.filter(
    i => i.type === 'budget_suggestion',
  ).length;

  if (pendingItems.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border bg-muted/50 px-4 py-2.5">
      <Text
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: theme.pageTextSubdued,
          marginRight: 4,
        }}
      >
        {t('{{count}} items pending', { count: pendingItems.length })}
      </Text>

      <View style={{ flex: 1 }} />

      <Button
        variant="bare"
        onPress={onAcceptHighConfidence}
        isDisabled={highConfidenceCount === 0}
        style={{ fontSize: 13 }}
      >
        <Trans>
          Accept All High Confidence
          {highConfidenceCount > 0 ? ` (${highConfidenceCount})` : ''}
        </Trans>
      </Button>

      <Button
        variant="bare"
        onPress={onDismissAllSuggestions}
        isDisabled={suggestionCount === 0}
        style={{ fontSize: 13 }}
      >
        <Trans>
          Dismiss All Suggestions
          {suggestionCount > 0 ? ` (${suggestionCount})` : ''}
        </Trans>
      </Button>
    </div>
  );
}
