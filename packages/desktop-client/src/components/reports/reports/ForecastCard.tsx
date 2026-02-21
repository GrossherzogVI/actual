import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { format as formatDate, parseISO } from 'date-fns';
import { Line, LineChart, ReferenceLine, ResponsiveContainer } from 'recharts';

import { send } from 'loot-core/platform/client/connection';
import type { ForecastResult } from 'loot-core/server/forecast/types';

import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { ReportCard } from '@desktop-client/components/reports/ReportCard';
import { ReportCardName } from '@desktop-client/components/reports/ReportCardName';
import { useDashboardWidgetCopyMenu } from '@desktop-client/components/reports/useDashboardWidgetCopyMenu';
import { useFormat } from '@desktop-client/hooks/useFormat';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';

type ForecastCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta?: { horizon?: number; name?: string };
  onMetaChange: (newMeta: { horizon?: number; name?: string }) => void;
  onRemove: () => void;
  onCopy: (targetDashboardId: string) => void;
};

export function ForecastCard({
  widgetId,
  isEditing,
  meta = {},
  onMetaChange,
  onRemove,
  onCopy,
}: ForecastCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const [fileId] = useMetadataPref('id');
  const [nameMenuOpen, setNameMenuOpen] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const [data, setData] = useState<ForecastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { menuItems: copyMenuItems, handleMenuSelect: handleCopyMenuSelect } =
    useDashboardWidgetCopyMenu(onCopy);

  const horizon = meta?.horizon ?? 90;

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;

    async function load() {
      try {
        const result = await send('forecast-baseline', {
          fileId: fileId as string,
          horizon,
          startingBalance: 0,
        });
        if (cancelled) return;
        if ('error' in result) {
          setError(result.error);
        } else {
          setData(result);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed');
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [fileId, horizon]);

  const onCardHover = useCallback(() => setIsCardHovered(true), []);
  const onCardHoverEnd = useCallback(() => setIsCardHovered(false), []);

  const chartData =
    data?.dailyCurve.map(day => ({
      date: day.date,
      balance: day.balance / 100,
    })) ?? [];

  const hasNegative = chartData.some(d => d.balance < 0);
  const worstDate = data?.worstPoint
    ? formatDate(parseISO(data.worstPoint.date), 'MMM dd')
    : '';

  return (
    <ReportCard
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      to="/forecast"
      menuItems={[
        { name: 'rename', text: t('Rename') },
        { name: 'remove', text: t('Remove') },
        ...copyMenuItems,
      ]}
      onMenuSelect={item => {
        if (handleCopyMenuSelect(item)) return;
        switch (item) {
          case 'rename':
            setNameMenuOpen(true);
            break;
          case 'remove':
            onRemove();
            break;
          default:
            throw new Error(`Unrecognized selection: ${item}`);
        }
      }}
    >
      <View
        style={{ flex: 1 }}
        onPointerEnter={onCardHover}
        onPointerLeave={onCardHoverEnd}
      >
        <View style={{ flexDirection: 'row', padding: 20 }}>
          <View style={{ flex: 1 }}>
            <ReportCardName
              name={meta?.name || t('Forecast')}
              isEditing={nameMenuOpen}
              onChange={newName => {
                onMetaChange({ ...meta, name: newName });
                setNameMenuOpen(false);
              }}
              onClose={() => setNameMenuOpen(false)}
            />
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              {t('Next {{days}} days', { days: horizon })}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 10 }}>
            <Text style={{ fontSize: 12, color: theme.errorText }}>{error}</Text>
          </View>
        ) : data ? (
          <View style={{ flex: 1, paddingLeft: 10, paddingRight: 10, paddingBottom: 10 }}>
            {/* Mini sparkline */}
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                {hasNegative && (
                  <ReferenceLine y={0} stroke={theme.errorText} strokeDasharray="3 3" />
                )}
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke={theme.reportsChartFill}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>

            {/* Key metrics */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
              <View>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                  {t('Lowest')}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: data.worstPoint.balance < 0 ? theme.errorText : theme.pageText,
                  }}
                >
                  {format(data.worstPoint.balance, 'financial')}
                </Text>
                <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
                  {worstDate}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                  {t('Safe to spend')}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: data.safeToSpend <= 0 ? theme.errorText : theme.pageTextPositive,
                  }}
                >
                  {format(data.safeToSpend, 'financial')}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          <LoadingIndicator />
        )}
      </View>
    </ReportCard>
  );
}
