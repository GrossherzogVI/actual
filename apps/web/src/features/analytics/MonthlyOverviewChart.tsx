import { useMemo } from 'react';

import ReactECharts from 'echarts-for-react';

import type { MonthSummary } from '../../core/types/finance';
import { ChartContainer } from './ChartContainer';
import { THEME_NAME } from './chart-theme';

const fmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return new Intl.DateTimeFormat('de-DE', {
    month: 'short',
    year: '2-digit',
  }).format(date);
}

type MonthlyOverviewChartProps = {
  data: MonthSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

export function MonthlyOverviewChart({
  data,
  isLoading,
  error,
}: MonthlyOverviewChartProps) {
  const option = useMemo(() => {
    if (!data || data.length === 0) return {};
    const months = data.map(d => formatMonthLabel(d.month));

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (
          params: { seriesName: string; value: number; marker: string }[],
        ) =>
          params
            .map(p => `${p.marker} ${p.seriesName}: ${fmt.format(p.value)}`)
            .join('<br/>'),
      },
      legend: {
        data: ['Einnahmen', 'Ausgaben', 'Netto'],
        bottom: 0,
      },
      xAxis: {
        type: 'category' as const,
        data: months,
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          formatter: (v: number) => fmt.format(v),
        },
      },
      series: [
        {
          name: 'Einnahmen',
          type: 'bar',
          data: data.map(d => d.income),
          itemStyle: { color: '#10b981' },
          barMaxWidth: 32,
        },
        {
          name: 'Ausgaben',
          type: 'bar',
          data: data.map(d => d.expenses),
          itemStyle: { color: '#ef4444' },
          barMaxWidth: 32,
        },
        {
          name: 'Netto',
          type: 'line',
          data: data.map(d => d.net),
          smooth: true,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#8b5cf6', width: 2 },
          itemStyle: { color: '#8b5cf6' },
        },
      ],
    };
  }, [data]);

  return (
    <ChartContainer
      title="Monatlicher Ueberblick"
      isLoading={isLoading}
      error={error}
    >
      <ReactECharts
        option={option}
        theme={THEME_NAME}
        style={{ height: 400 }}
        notMerge
      />
    </ChartContainer>
  );
}
