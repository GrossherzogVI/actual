// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useNavigate } from '@desktop-client/hooks/useNavigate';

import type { ReviewCounts } from '../types';
import { WidgetCard } from './WidgetCard';

type RowProps = {
  label: string;
  count: number;
  color: string;
  onClick: () => void;
};

function CountRow({ label, count, color, onClick }: RowProps) {
  return (
    <View
      onClick={onClick}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        borderRadius: 4,
        cursor: 'pointer',
        marginBottom: 4,
      }}
    >
      <Text style={{ color: theme.pageText, fontSize: 13 }}>{label}</Text>
      <View
        style={{
          backgroundColor: color,
          borderRadius: 12,
          minWidth: 24,
          paddingLeft: 8,
          paddingRight: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 600 }}>{count}</Text>
      </View>
    </View>
  );
}

type Props = {
  counts: ReviewCounts | null;
  loading: boolean;
};

export function AttentionQueueWidget({ counts, loading }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const goToReview = () => navigate('/review');

  return (
    <WidgetCard title={t('Attention Queue')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{t('Loading…')}</Text>
      ) : counts == null ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('No review data available.')}
        </Text>
      ) : (
        <>
          <CountRow
            label={t('Urgent')}
            count={counts.urgent}
            color="#ef4444"
            onClick={goToReview}
          />
          <CountRow
            label={t('To review')}
            count={counts.review}
            color="#f59e0b"
            onClick={goToReview}
          />
          <CountRow
            label={t('Suggestions')}
            count={counts.suggestion}
            color="#3b82f6"
            onClick={goToReview}
          />
          {counts.pending > 0 && (
            <Text
              style={{
                color: theme.pageTextSubdued,
                fontSize: 11,
                marginTop: 8,
                textAlign: 'center',
              }}
            >
              {t('+{{count}} pending', { count: counts.pending })}
            </Text>
          )}
        </>
      )}
    </WidgetCard>
  );
}
