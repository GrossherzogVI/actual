// @ts-strict-ignore
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';

import { AIRuleSuggestions } from './AIRuleSuggestions';

type AIClassificationItem = {
  id: string;
  transaction_id: string;
  date: string;
  payee_name: string;
  amount: number;
  proposed_category: string;
  proposed_category_name: string;
  confidence: number;
  reasoning: string;
  status: string;
};

type ConfidenceFilter = 'all' | 'high' | 'low';

const CONFIDENCE_COLORS = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#ef4444',
} as const;

function getConfidenceLevel(
  confidence: number,
): 'high' | 'medium' | 'low' {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

function formatAmount(amount: number | null): string {
  if (amount == null) return '-';
  return (amount / 100).toFixed(2);
}

export function AIReviewQueue() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('aiClassification');
  const [budgetId] = useMetadataPref('id');

  const [items, setItems] = useState<AIClassificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ConfidenceFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  const loadQueue = useCallback(async () => {
    if (!budgetId) return;
    setLoading(true);
    const result = await (send as Function)('ai-queue-list', {
      fileId: budgetId,
      limit: 200,
    });
    if (result && !('error' in result)) {
      setItems(result);
    }
    setLoading(false);
  }, [budgetId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'high') return items.filter(i => i.confidence >= 0.8);
    return items.filter(i => i.confidence < 0.8);
  }, [items, filter]);

  const highConfidenceCount = useMemo(
    () => items.filter(i => i.confidence >= 0.8).length,
    [items],
  );

  const handleResolve = useCallback(
    async (id: string, status: 'accepted' | 'rejected') => {
      setResolving(prev => new Set(prev).add(id));
      await (send as Function)('ai-queue-resolve', { id, status });
      setItems(prev => prev.filter(i => i.id !== id));
      setResolving(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [],
  );

  const handleBulkAccept = useCallback(async () => {
    const highConfidence = items.filter(i => i.confidence >= 0.8);
    for (const item of highConfidence) {
      await (send as Function)('ai-queue-resolve', {
        id: item.id,
        status: 'accepted',
      });
    }
    setItems(prev => prev.filter(i => i.confidence < 0.8));
  }, [items]);

  if (!enabled) {
    return (
      <Page header={t('AI Review Queue')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t(
              'AI Classification is not enabled. Enable it in Settings > Feature Flags.',
            )}
          </Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('AI Review Queue')}>
      {/* Stats bar */}
      <View
        style={{
          flexDirection: 'row',
          gap: 20,
          padding: '0 0 15px',
          fontSize: 13,
        }}
      >
        <Text>
          <Text style={{ fontWeight: 600 }}>{items.length}</Text>{' '}
          {t('pending')}
        </Text>
        <Text>
          <Text style={{ fontWeight: 600 }}>{highConfidenceCount}</Text>{' '}
          {t('high confidence')}
        </Text>
      </View>

      {/* Filter + bulk actions */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '0 0 15px',
          gap: 10,
        }}
      >
        <View>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as ConfidenceFilter)}
            style={{
              padding: '5px 10px',
              borderRadius: 4,
              border: `1px solid ${theme.tableBorder}`,
              backgroundColor: theme.tableBackground,
              color: theme.pageText,
              fontSize: 13,
            }}
          >
            <option value="all">{t('All')}</option>
            <option value="high">{t('High confidence (>0.8)')}</option>
            <option value="low">{t('Low confidence (<0.8)')}</option>
          </select>
        </View>
        <View
          style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}
        >
          {highConfidenceCount > 0 && (
            <Button variant="primary" onPress={handleBulkAccept}>
              <Trans>Accept all high-confidence ({{ count: highConfidenceCount }})</Trans>
            </Button>
          )}
        </View>
      </View>

      {/* Table */}
      <View
        style={{
          backgroundColor: theme.tableBackground,
          borderRadius: 4,
          overflow: 'hidden',
          flex: 1,
        }}
      >
        {/* Table header */}
        <View
          style={{
            flexDirection: 'row',
            padding: '8px 15px',
            borderBottom: `1px solid ${theme.tableBorder}`,
            backgroundColor: theme.tableHeaderBackground,
            fontSize: 12,
            fontWeight: 600,
            color: theme.pageTextSubdued,
          }}
        >
          <View style={{ width: 90 }}>{t('Date')}</View>
          <View style={{ flex: 2 }}>{t('Payee')}</View>
          <View style={{ flex: 1, textAlign: 'right' }}>{t('Amount')}</View>
          <View style={{ flex: 2 }}>{t('Proposed Category')}</View>
          <View style={{ width: 90, textAlign: 'center' }}>
            {t('Confidence')}
          </View>
          <View style={{ flex: 2 }}>{t('Reasoning')}</View>
          <View style={{ width: 100, textAlign: 'center' }}>
            {t('Actions')}
          </View>
        </View>

        {/* Table body */}
        {loading ? (
          <View style={{ padding: 20, textAlign: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              {t('Loading...')}
            </Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={{ padding: 20, textAlign: 'center' }}>
            <Text style={{ color: theme.pageTextSubdued }}>
              {filter !== 'all'
                ? t('No items match the current filter.')
                : t('No pending classifications. All caught up!')}
            </Text>
          </View>
        ) : (
          filteredItems.map(item => {
            const level = getConfidenceLevel(item.confidence);
            const isExpanded = expandedId === item.id;
            const isResolving = resolving.has(item.id);

            return (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  padding: '10px 15px',
                  borderBottom: `1px solid ${theme.tableBorder}`,
                  fontSize: 13,
                  alignItems: 'center',
                  opacity: isResolving ? 0.5 : 1,
                }}
              >
                <View style={{ width: 90 }}>
                  <Text>{item.date}</Text>
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={{ fontWeight: 500 }}>{item.payee_name}</Text>
                </View>
                <View style={{ flex: 1, textAlign: 'right' }}>
                  <Text>{formatAmount(item.amount)}</Text>
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={{ fontWeight: 600 }}>
                    {item.proposed_category_name}
                  </Text>
                </View>
                <View style={{ width: 90, textAlign: 'center' }}>
                  <ConfidenceBadge
                    confidence={item.confidence}
                    level={level}
                  />
                </View>
                <View
                  style={{ flex: 2, cursor: 'pointer' }}
                  onClick={() =>
                    setExpandedId(isExpanded ? null : item.id)
                  }
                >
                  <Text
                    style={{
                      overflow: isExpanded ? 'visible' : 'hidden',
                      textOverflow: isExpanded ? 'unset' : 'ellipsis',
                      whiteSpace: isExpanded ? 'normal' : 'nowrap',
                      fontSize: 12,
                      color: theme.pageTextSubdued,
                    }}
                  >
                    {item.reasoning || '-'}
                  </Text>
                </View>
                <View
                  style={{
                    width: 100,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Button
                    variant="bare"
                    isDisabled={isResolving}
                    onPress={() => handleResolve(item.id, 'accepted')}
                    style={{
                      color: '#10b981',
                      fontWeight: 600,
                      fontSize: 16,
                      padding: '2px 6px',
                    }}
                  >
                    &#10003;
                  </Button>
                  <Button
                    variant="bare"
                    isDisabled={isResolving}
                    onPress={() => handleResolve(item.id, 'rejected')}
                    style={{
                      color: '#ef4444',
                      fontWeight: 600,
                      fontSize: 16,
                      padding: '2px 6px',
                    }}
                  >
                    &#10007;
                  </Button>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Rule suggestions section */}
      <AIRuleSuggestions />
    </Page>
  );
}

function ConfidenceBadge({
  confidence,
  level,
}: {
  confidence: number;
  level: 'high' | 'medium' | 'low';
}) {
  const color = CONFIDENCE_COLORS[level];
  return (
    <Text
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 500,
        backgroundColor: `${color}20`,
        color,
      }}
    >
      {(confidence * 100).toFixed(0)}%
    </Text>
  );
}
