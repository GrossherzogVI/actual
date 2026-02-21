// @ts-strict-ignore
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';

type RuleSuggestion = {
  id: string;
  payee_pattern: string;
  match_field: string;
  proposed_category: string;
  proposed_category_name: string;
  hit_count: number;
  confidence: number;
};

export function AIRuleSuggestions() {
  const { t } = useTranslation();
  const [budgetId] = useMetadataPref('id');

  const [suggestions, setSuggestions] = useState<RuleSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      if (!budgetId) return;
      setLoading(true);
      const result = await (send as Function)('ai-rule-suggestions', {
        fileId: budgetId,
        minHitCount: 3,
      });
      if (result && !('error' in result)) {
        setSuggestions(result);
      }
      setLoading(false);
    }
    void load();
  }, [budgetId]);

  const handleAccept = useCallback(async (id: string) => {
    setAccepting(prev => new Set(prev).add(id));
    await (send as Function)('ai-rule-accept', { id });
    setSuggestions(prev => prev.filter(s => s.id !== id));
    setAccepting(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }, []);

  if (loading) {
    return (
      <View style={{ marginTop: 30 }}>
        <Text
          style={{
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          {t('Suggested Rules')}
        </Text>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Loading...')}
        </Text>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return null;
  }

  return (
    <View style={{ marginTop: 30 }}>
      <Text
        style={{
          fontSize: 15,
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {t('Suggested Rules')} ({suggestions.length})
      </Text>

      <View
        style={{
          backgroundColor: theme.tableBackground,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
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
          <View style={{ flex: 2 }}>{t('Payee Pattern')}</View>
          <View style={{ flex: 1 }}>{t('Match Field')}</View>
          <View style={{ flex: 2 }}>{t('Proposed Category')}</View>
          <View style={{ width: 80, textAlign: 'center' }}>
            {t('Hits')}
          </View>
          <View style={{ width: 120, textAlign: 'center' }}>
            {t('Actions')}
          </View>
        </View>

        {/* Rows */}
        {suggestions.map(suggestion => {
          const isAccepting = accepting.has(suggestion.id);

          return (
            <View
              key={suggestion.id}
              style={{
                flexDirection: 'row',
                padding: '10px 15px',
                borderBottom: `1px solid ${theme.tableBorder}`,
                fontSize: 13,
                alignItems: 'center',
                opacity: isAccepting ? 0.5 : 1,
              }}
            >
              <View style={{ flex: 2 }}>
                <Text style={{ fontWeight: 500 }}>
                  {suggestion.payee_pattern}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.pageTextSubdued }}>
                  {suggestion.match_field}
                </Text>
              </View>
              <View style={{ flex: 2 }}>
                <Text style={{ fontWeight: 600 }}>
                  {suggestion.proposed_category_name}
                </Text>
              </View>
              <View style={{ width: 80, textAlign: 'center' }}>
                <Text>{suggestion.hit_count}</Text>
              </View>
              <View
                style={{
                  width: 120,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Button
                  variant="primary"
                  isDisabled={isAccepting}
                  onPress={() => handleAccept(suggestion.id)}
                  style={{ fontSize: 12, padding: '3px 10px' }}
                >
                  {t('Accept')}
                </Button>
                <Button
                  variant="bare"
                  isDisabled={isAccepting}
                  onPress={() => handleDismiss(suggestion.id)}
                  style={{
                    fontSize: 12,
                    padding: '3px 10px',
                    color: theme.pageTextSubdued,
                  }}
                >
                  {t('Dismiss')}
                </Button>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
