// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
import { allAccountBalance } from '@desktop-client/spreadsheet/bindings';

import type { UpcomingPayment } from '../types';
import { formatEur } from '../utils';
import { WidgetCard } from './WidgetCard';

type Props = {
  upcomingPayments?: UpcomingPayment[];
};

/**
 * Compute projected balance at +N days by subtracting upcoming payments
 * that fall within that window.
 */
function projectBalance(
  currentBalance: number,
  payments: UpcomingPayment[],
  daysAhead: number,
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  let totalOutflow = 0;
  for (const p of payments) {
    const pDate = new Date(p.date + 'T00:00:00');
    if (pDate >= today && pDate <= cutoff && p.amount != null) {
      // Contract amounts are stored as positive costs; subtract them
      totalOutflow += Math.abs(p.amount);
    }
  }

  return currentBalance - totalOutflow;
}

function ProjectionRow({
  label,
  value,
  isNegative,
  isBelowThreshold,
}: {
  label: string;
  value: string;
  isNegative: boolean;
  isBelowThreshold: boolean;
}) {
  const textColor = isNegative || isBelowThreshold
    ? (theme.errorText ?? '#ef4444')
    : theme.pageText;

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '3px 6px',
        borderRadius: 4,
        ...(isBelowThreshold && !isNegative
          ? {
              backgroundColor: `${theme.errorText ?? '#ef4444'}12`,
            }
          : {}),
      }}
    >
      <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{label}</Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: textColor,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function BalanceProjectionWidget({ upcomingPayments = [] }: Props) {
  const { t } = useTranslation();

  // Query-based binding — no SheetNameProvider needed
  const currentBalance = useSheetValue<'account', 'accounts-balance'>(allAccountBalance());

  // Balance threshold pref (shared with CalendarPage, stored as cents string)
  const [thresholdRaw, setThresholdRaw] = useSyncedPref('balanceThreshold');
  const threshold = thresholdRaw ? parseInt(thresholdRaw, 10) : null;
  const thresholdEnabled = threshold !== null && !Number.isNaN(threshold);

  // Local state for threshold settings popover
  const [showSettings, setShowSettings] = useState(false);
  const [thresholdInput, setThresholdInput] = useState<string>(
    threshold ? String(threshold / 100) : '',
  );

  const handleToggleThreshold = useCallback(() => {
    if (thresholdEnabled) {
      setThresholdRaw('');
      setThresholdInput('');
    } else {
      setThresholdRaw('50000');
      setThresholdInput('500');
    }
  }, [thresholdEnabled, setThresholdRaw]);

  const handleThresholdBlur = useCallback(() => {
    const euros = parseFloat(thresholdInput);
    if (!Number.isNaN(euros) && euros >= 0) {
      setThresholdRaw(String(Math.round(euros * 100)));
    }
  }, [thresholdInput, setThresholdRaw]);

  const hasData = currentBalance != null;

  const projections = hasData
    ? [
        { label: t('Today'), days: 0 },
        { label: t('+7 days'), days: 7 },
        { label: t('+14 days'), days: 14 },
        { label: t('+30 days'), days: 30 },
      ].map(({ label, days }) => {
        const projected =
          days === 0
            ? currentBalance
            : projectBalance(currentBalance, upcomingPayments, days);
        return {
          label,
          value: formatEur(projected),
          isNegative: projected < 0,
          isBelowThreshold: thresholdEnabled && projected < threshold,
        };
      })
    : [];

  // Determine if any projection crosses the threshold (for card border highlight)
  const anyBelowThreshold = thresholdEnabled && projections.some(p => p.isBelowThreshold);

  return (
    <WidgetCard
      title={t('Balance Projection')}
      style={{
        gridColumn: '1 / -1',
        ...(anyBelowThreshold
          ? {
              borderColor: theme.errorText ?? '#ef4444',
              boxShadow: `0 0 0 1px ${theme.errorText ?? '#ef4444'}30`,
            }
          : {}),
      }}
    >
      {/* Settings toggle row */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginTop: -8,
          marginBottom: 4,
          gap: 6,
        }}
      >
        {showSettings && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Button
              variant="bare"
              onPress={handleToggleThreshold}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                border: `1px solid ${thresholdEnabled ? (theme.errorText ?? '#ef4444') : theme.tableBorder}`,
                borderRadius: 10,
                backgroundColor: thresholdEnabled ? `${theme.errorText ?? '#ef4444'}18` : 'transparent',
                color: thresholdEnabled ? (theme.errorText ?? '#ef4444') : theme.pageTextSubdued,
              }}
            >
              {thresholdEnabled ? t('Disable') : t('Enable')}
            </Button>
            {thresholdEnabled && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>Min €</Text>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={thresholdInput}
                  onChange={e => setThresholdInput(e.target.value)}
                  onBlur={handleThresholdBlur}
                  style={{
                    width: 60,
                    fontSize: 11,
                    padding: '2px 4px',
                    border: `1px solid ${theme.tableBorder}`,
                    borderRadius: 4,
                    backgroundColor: theme.tableBackground,
                    color: theme.pageText,
                  }}
                />
              </View>
            )}
          </View>
        )}
        <Button
          variant="bare"
          onPress={() => setShowSettings(prev => !prev)}
          aria-label={t('Threshold settings')}
          style={{
            fontSize: 13,
            padding: '2px 6px',
            color: thresholdEnabled ? (theme.errorText ?? '#ef4444') : theme.pageTextSubdued,
          }}
        >
          ⚙
        </Button>
      </View>

      {!hasData ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Loading balance data...')}
        </Text>
      ) : upcomingPayments.length === 0 ? (
        <View>
          <ProjectionRow
            label={t('Current balance')}
            value={formatEur(currentBalance)}
            isNegative={currentBalance < 0}
            isBelowThreshold={thresholdEnabled && currentBalance < threshold}
          />
          <Text
            style={{
              color: theme.pageTextSubdued,
              fontSize: 12,
              fontStyle: 'italic',
              marginTop: 4,
            }}
          >
            {t('Add contracts to see projected outflows.')}
          </Text>
        </View>
      ) : (
        <View>
          {projections.map(p => (
            <ProjectionRow
              key={p.label}
              label={p.label}
              value={p.value}
              isNegative={p.isNegative}
              isBelowThreshold={p.isBelowThreshold}
            />
          ))}
          {thresholdEnabled && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                marginTop: 6,
                padding: '3px 6px',
                borderRadius: 4,
                backgroundColor: `${theme.errorText ?? '#ef4444'}08`,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: theme.errorText ?? '#ef4444',
                  flexShrink: 0,
                }}
              />
              <Text style={{ fontSize: 11, color: theme.errorText ?? '#ef4444' }}>
                {t('Threshold: {{amount}}', { amount: formatEur(threshold) })}
              </Text>
            </View>
          )}
          <Text
            style={{
              color: theme.pageTextSubdued,
              fontSize: 11,
              fontStyle: 'italic',
              marginTop: 4,
            }}
          >
            {t('Based on {{count}} upcoming payments', {
              count: upcomingPayments.length,
            })}
          </Text>
        </View>
      )}
    </WidgetCard>
  );
}
