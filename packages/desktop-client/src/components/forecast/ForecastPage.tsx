import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';
import { format as formatDate, parseISO } from 'date-fns';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { send } from 'loot-core/platform/client/connection';
import type {
  DailyBalance,
  ForecastEvent,
  ForecastResult,
} from 'loot-core/server/forecast/types';
import type { ScenarioDelta } from 'loot-core/server/forecast/app';

import { Page } from '@desktop-client/components/Page';
import { LoadingIndicator } from '@desktop-client/components/reports/LoadingIndicator';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useFormat } from '@desktop-client/hooks/useFormat';
import type { UseFormatResult } from '@desktop-client/hooks/useFormat';
import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';

type HorizonOption = 90 | 180 | 365;

type ScenarioMutationUI =
  | { type: 'cancel_contract'; contractId: string }
  | { type: 'modify_amount'; contractId: string; newAmount: number }
  | {
      type: 'add_event';
      date: string;
      amount: number;
      description: string;
    };

type ChartDataPoint = {
  date: string;
  dateLabel: string;
  baseline: number | null;
  scenario: number | null;
  belowZero: number | null;
  events: ForecastEvent[];
};

function centsToEur(cents: number): number {
  return cents / 100;
}

function buildChartData(
  dailyCurve: DailyBalance[],
  scenarioCurve?: DailyBalance[],
  horizon?: HorizonOption,
): ChartDataPoint[] {
  const dateFormat = horizon && horizon > 180 ? 'MMM yyyy' : 'MMM dd';

  return dailyCurve.map((day, i) => {
    const baselineEur = centsToEur(day.balance);
    const scenarioDay = scenarioCurve?.[i];
    const scenarioEur = scenarioDay ? centsToEur(scenarioDay.balance) : null;

    return {
      date: day.date,
      dateLabel: formatDate(parseISO(day.date), dateFormat),
      baseline: baselineEur,
      scenario: scenarioEur,
      belowZero: baselineEur < 0 ? baselineEur : null,
      events: day.events,
    };
  });
}

// -- Tooltip --

type ForecastTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
  formatFn: UseFormatResult;
};

function ForecastTooltip({
  active,
  payload,
  formatFn,
}: ForecastTooltipProps) {
  const { t } = useTranslation();

  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload as ChartDataPoint | undefined;
  if (!point) return null;

  return (
    <div
      className={css({
        zIndex: 1000,
        pointerEvents: 'none',
        borderRadius: 2,
        boxShadow: '0 1px 6px rgba(0, 0, 0, .20)',
        backgroundColor: theme.menuBackground,
        color: theme.menuItemText,
        padding: 10,
        maxWidth: 280,
      })}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        {formatDate(parseISO(point.date), 'EEEE, MMM dd, yyyy')}
      </div>
      <div style={{ lineHeight: 1.6 }}>
        <div>
          {t('Balance')}: {formatFn(Math.round((point.baseline ?? 0) * 100), 'financial')}
        </div>
        {point.scenario !== null && (
          <div style={{ color: theme.noticeTextLight }}>
            {t('Scenario')}: {formatFn(Math.round(point.scenario * 100), 'financial')}
          </div>
        )}
      </div>
      {point.events.length > 0 && (
        <div style={{ marginTop: 6, borderTop: '1px solid ' + theme.tableBorder, paddingTop: 6 }}>
          {point.events.map((ev, idx) => (
            <div key={idx} style={{ fontSize: 12 }}>
              {ev.description}: {formatFn(ev.amount, 'financial')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -- Scenario Panel --

type ScenarioPanelProps = {
  mutations: ScenarioMutationUI[];
  onMutationsChange: (mutations: ScenarioMutationUI[]) => void;
  onApply: () => void;
  onClear: () => void;
  loading: boolean;
};

function ScenarioPanel({
  mutations,
  onMutationsChange,
  onApply,
  onClear,
  loading,
}: ScenarioPanelProps) {
  const { t } = useTranslation();
  const [eventDate, setEventDate] = useState('');
  const [eventAmount, setEventAmount] = useState('');
  const [eventDesc, setEventDesc] = useState('');

  const addMutation = useCallback(() => {
    if (eventDate && eventAmount && eventDesc) {
      const amountCents = Math.round(parseFloat(eventAmount) * 100);
      if (isNaN(amountCents)) return;
      onMutationsChange([
        ...mutations,
        {
          type: 'add_event',
          date: eventDate,
          amount: amountCents,
          description: eventDesc,
        },
      ]);
      setEventDate('');
      setEventAmount('');
      setEventDesc('');
    }
  }, [eventDate, eventAmount, eventDesc, mutations, onMutationsChange]);

  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        borderRadius: 6,
        padding: 16,
        marginTop: 16,
        border: '1px solid ' + theme.tableBorder,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
        {t('What if...')}
      </Text>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: 500, color: theme.pageTextSubdued }}>
          {t('Add a one-time event')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>{t('Date')}</Text>
            <Input
              type="date"
              value={eventDate}
              onChangeValue={v => setEventDate(v)}
              style={{ width: 140 }}
            />
          </View>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>{t('Amount (EUR)')}</Text>
            <Input
              value={eventAmount}
              onChangeValue={v => setEventAmount(v)}
              placeholder="-500 or 1000"
              style={{ width: 130 }}
            />
          </View>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>{t('Description')}</Text>
            <Input
              value={eventDesc}
              onChangeValue={v => setEventDesc(v)}
              placeholder={t('e.g. New laptop')}
              style={{ width: 180 }}
            />
          </View>
          <Button variant="primary" onPress={addMutation}>
            {t('Add')}
          </Button>
        </View>

        {mutations.length > 0 && (
          <View style={{ marginTop: 8, gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: 500 }}>
              {t('Pending mutations ({{count}})', { count: mutations.length })}
            </Text>
            {mutations.map((m, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                }}
              >
                <Text style={{ fontSize: 12, flex: 1 }}>
                  {m.type === 'add_event'
                    ? `${m.description}: ${(m.amount / 100).toFixed(2)} EUR on ${m.date}`
                    : m.type}
                </Text>
                <Button
                  variant="bare"
                  onPress={() => {
                    const next = [...mutations];
                    next.splice(idx, 1);
                    onMutationsChange(next);
                  }}
                >
                  <Text style={{ color: theme.errorText, fontSize: 12 }}>{t('Remove')}</Text>
                </Button>
              </View>
            ))}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button
            variant="primary"
            isDisabled={mutations.length === 0 || loading}
            onPress={onApply}
          >
            {loading ? t('Loading...') : t('Apply Scenario')}
          </Button>
          <Button variant="bare" onPress={onClear}>
            {t('Clear Scenario')}
          </Button>
        </View>
      </View>
    </View>
  );
}

// -- Main Page --

export function ForecastPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('forecastEngine');
  const format = useFormat();
  const [fileId] = useMetadataPref('id');

  const [horizon, setHorizon] = useState<HorizonOption>(180);
  const [startingBalanceInput, setStartingBalanceInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scenarioLoading, setScenarioLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baselineResult, setBaselineResult] = useState<ForecastResult | null>(null);
  const [scenarioResult, setScenarioResult] = useState<ForecastResult | null>(null);
  const [scenarioDelta, setScenarioDelta] = useState<ScenarioDelta | null>(null);
  const [mutations, setMutations] = useState<ScenarioMutationUI[]>([]);
  const [scenarioPanelOpen, setScenarioPanelOpen] = useState(false);

  const startingBalance = useMemo(() => {
    const parsed = parseFloat(startingBalanceInput);
    return isNaN(parsed) ? 0 : Math.round(parsed * 100);
  }, [startingBalanceInput]);

  // Load baseline
  const loadBaseline = useCallback(async () => {
    if (!fileId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await send('forecast-baseline', {
        fileId: fileId as string,
        horizon,
        startingBalance,
      });
      if ('error' in result) {
        setError(result.error);
      } else {
        setBaselineResult(result);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load forecast');
    } finally {
      setLoading(false);
    }
  }, [fileId, horizon, startingBalance]);

  useEffect(() => {
    void loadBaseline();
  }, [loadBaseline]);

  // Apply scenario
  const applyScenario = useCallback(async () => {
    if (!fileId || mutations.length === 0) return;
    setScenarioLoading(true);
    try {
      const result = await send('forecast-scenario', {
        fileId: fileId as string,
        horizon,
        startingBalance,
        mutations,
      });
      if ('error' in result) {
        setError(result.error);
      } else {
        setBaselineResult(result.baseline);
        setScenarioResult(result.scenario);
        setScenarioDelta(result.delta);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Scenario failed');
    } finally {
      setScenarioLoading(false);
    }
  }, [fileId, horizon, startingBalance, mutations]);

  const clearScenario = useCallback(() => {
    setScenarioResult(null);
    setScenarioDelta(null);
    setMutations([]);
  }, []);

  const chartData = useMemo(() => {
    if (!baselineResult) return [];
    return buildChartData(
      baselineResult.dailyCurve,
      scenarioResult?.dailyCurve,
      horizon,
    );
  }, [baselineResult, scenarioResult, horizon]);

  if (!enabled) {
    return (
      <Page header={t('Forecast')}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={{ ...styles.mediumText, color: theme.pageTextSubdued }}>
            {t('The forecast feature is not enabled. Enable it in Settings > Feature Flags.')}
          </Text>
        </View>
      </Page>
    );
  }

  const horizonOptions: HorizonOption[] = [90, 180, 365];

  return (
    <Page header={t('Forecast')}>
      <View style={{ flex: 1, gap: 16, paddingBottom: 20 }}>
        {/* Controls bar */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {horizonOptions.map(h => (
              <Button
                key={h}
                variant={horizon === h ? 'primary' : 'bare'}
                onPress={() => setHorizon(h)}
              >
                {t('{{days}} days', { days: h })}
              </Button>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
              {t('Starting balance (EUR):')}
            </Text>
            <Input
              value={startingBalanceInput}
              onChangeValue={v => setStartingBalanceInput(v)}
              placeholder="0"
              style={{ width: 100 }}
            />
          </View>

          <Button
            variant="bare"
            onPress={() => setScenarioPanelOpen(!scenarioPanelOpen)}
          >
            {scenarioPanelOpen ? t('Hide Scenarios') : t('What if...')}
          </Button>
        </View>

        {/* Error */}
        {error && (
          <View
            style={{
              padding: 12,
              backgroundColor: theme.errorBackground,
              borderRadius: 4,
            }}
          >
            <Text style={{ color: theme.errorText }}>{error}</Text>
          </View>
        )}

        {/* Chart */}
        {loading ? (
          <LoadingIndicator message={t('Loading forecast...')} />
        ) : chartData.length > 0 ? (
          <View
            style={{
              backgroundColor: theme.tableBackground,
              borderRadius: 6,
              padding: 16,
              border: '1px solid ' + theme.tableBorder,
            }}
          >
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fill: theme.pageText, fontSize: 11 }}
                  tickLine={{ stroke: theme.pageText }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: theme.pageText, fontSize: 11 }}
                  tickLine={{ stroke: theme.pageText }}
                  tickFormatter={(val: number) => format(Math.round(val * 100), 'financial-no-decimals')}
                />
                <Tooltip
                  content={(props: Record<string, unknown>) => (
                    <ForecastTooltip
                      active={props.active as boolean}
                      payload={props.payload as ForecastTooltipProps['payload']}
                      formatFn={format}
                    />
                  )}
                  isAnimationActive={false}
                />
                <ReferenceLine y={0} stroke={theme.errorText} strokeDasharray="4 4" />

                {/* Red zone below zero */}
                <Area
                  type="monotone"
                  dataKey="belowZero"
                  fill={theme.errorText}
                  fillOpacity={0.1}
                  stroke="none"
                  connectNulls={false}
                  isAnimationActive={false}
                />

                {/* Baseline line */}
                <Line
                  type="monotone"
                  dataKey="baseline"
                  stroke={theme.reportsChartFill}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />

                {/* Scenario line */}
                {scenarioResult && (
                  <Line
                    type="monotone"
                    dataKey="scenario"
                    stroke={theme.noticeTextLight}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </View>
        ) : null}

        {/* Summary stats */}
        {baselineResult && (
          <View
            style={{
              flexDirection: 'row',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            <StatCard
              label={t('Lowest Balance')}
              value={format(baselineResult.worstPoint.balance, 'financial')}
              subtext={formatDate(parseISO(baselineResult.worstPoint.date), 'MMM dd, yyyy')}
              danger={baselineResult.worstPoint.balance < 0}
            />
            <StatCard
              label={t('Safe to Spend')}
              value={format(baselineResult.safeToSpend, 'financial')}
              danger={baselineResult.safeToSpend <= 0}
            />
            {scenarioDelta && (
              <StatCard
                label={t('Scenario Impact')}
                value={format(scenarioDelta.totalDelta, 'financial')}
                subtext={t('vs baseline worst point')}
                danger={scenarioDelta.scenarioWorstPoint < scenarioDelta.baselineWorstPoint}
              />
            )}
          </View>
        )}

        {/* Scenario panel */}
        {scenarioPanelOpen && (
          <ScenarioPanel
            mutations={mutations}
            onMutationsChange={setMutations}
            onApply={applyScenario}
            onClear={clearScenario}
            loading={scenarioLoading}
          />
        )}
      </View>
    </Page>
  );
}

// -- Stat Card --

type StatCardProps = {
  label: string;
  value: string;
  subtext?: string;
  danger?: boolean;
};

function StatCard({ label, value, subtext, danger }: StatCardProps) {
  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        borderRadius: 6,
        padding: 16,
        border: '1px solid ' + theme.tableBorder,
        minWidth: 180,
        flex: 1,
      }}
    >
      <Text style={{ fontSize: 12, color: theme.pageTextSubdued, marginBottom: 4 }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: danger ? theme.errorText : theme.pageText,
        }}
      >
        {value}
      </Text>
      {subtext && (
        <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginTop: 2 }}>
          {subtext}
        </Text>
      )}
    </View>
  );
}
