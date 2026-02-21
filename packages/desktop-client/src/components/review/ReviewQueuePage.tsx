// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';

import { ReviewBatchActions } from './ReviewBatchActions';
import { ReviewFilters } from './ReviewFilters';
import { ReviewItem } from './ReviewItem';
import { ReviewStats } from './ReviewStats';
import { useReviewQueue } from './hooks/useReviewQueue';
import { useReviewActions } from './hooks/useReviewActions';
import type { TypeFilter, PriorityFilter } from './types';

export function ReviewQueuePage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('reviewQueue');

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  const { items, counts, loading, error, hasMore, reload, loadMore } =
    useReviewQueue({ typeFilter, priorityFilter });

  const { processing, accept, reject, snooze, dismiss, acceptHighConfidence, dismissAllSuggestions } =
    useReviewActions({ onSuccess: reload });

  const handleAcceptHighConfidence = useCallback(async () => {
    await acceptHighConfidence(items);
  }, [acceptHighConfidence, items]);

  const handleDismissAllSuggestions = useCallback(async () => {
    await dismissAllSuggestions(items);
  }, [dismissAllSuggestions, items]);

  if (!enabled) {
    return (
      <Page header={t('Review Queue')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>
              Review Queue is not enabled. Enable it in{' '}
              <strong>Settings &gt; Feature Flags</strong>.
            </Trans>
          </Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('Review Queue')}>
      {/* Stats bar */}
      <ReviewStats counts={counts} />

      {/* Filters */}
      <ReviewFilters
        typeFilter={typeFilter}
        priorityFilter={priorityFilter}
        onTypeChange={setTypeFilter}
        onPriorityChange={setPriorityFilter}
      />

      {/* Batch actions */}
      <ReviewBatchActions
        items={items}
        onAcceptHighConfidence={handleAcceptHighConfidence}
        onDismissAllSuggestions={handleDismissAllSuggestions}
      />

      {/* Main list */}
      <View
        style={{
          flex: 1,
          backgroundColor: theme.tableBackground,
          borderRadius: 6,
          border: `1px solid ${theme.tableBorder}`,
          overflow: 'hidden',
        }}
      >
        {loading && items.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>{t('Loading...')}</Text>
          </View>
        ) : error ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#ef4444' }}>
              {t('Error loading review queue: {{error}}', { error })}
            </Text>
          </View>
        ) : items.length === 0 ? (
          <View
            style={{
              padding: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: theme.pageTextSubdued,
                marginBottom: 8,
              }}
            >
              {typeFilter !== 'all' || priorityFilter !== 'all'
                ? t('No matches')
                : t('All caught up!')}
            </Text>
            <Text style={{ fontSize: 13, color: theme.pageTextSubdued, textAlign: 'center', maxWidth: 360 }}>
              {typeFilter !== 'all' || priorityFilter !== 'all'
                ? t('No items match the current filters.')
                : t(
                    'No items need your review right now. AI will populate this as transactions are categorized.',
                  )}
            </Text>
          </View>
        ) : (
          <>
            {items.map(item => (
              <ReviewItem
                key={item.id}
                item={item}
                isProcessing={processing.has(item.id)}
                onAccept={accept}
                onReject={reject}
                onSnooze={snooze}
                onDismiss={dismiss}
              />
            ))}

            {hasMore && (
              <View
                style={{
                  padding: '12px 15px',
                  alignItems: 'center',
                  borderTop: `1px solid ${theme.tableBorder}`,
                }}
              >
                {loading ? (
                  <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
                    {t('Loading more...')}
                  </Text>
                ) : (
                  <Text
                    style={{
                      fontSize: 13,
                      color: theme.pageTextLight,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                    onClick={loadMore}
                  >
                    {t('Load more')}
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </Page>
  );
}
