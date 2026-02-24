import { useMemo } from 'react';

import ReactECharts from 'echarts-for-react';

import type { FixedVarDetail } from '../../core/types/finance';
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

type FixedVsVariableChartProps = {
  data: FixedVarDetail[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

export function FixedVsVariableChart({
  data,
  isLoading,
  error,
}: FixedVsVariableChartProps) {
  const option = useMemo(() => {
    if (!data || data.length === 0) return {};
    const months = data.map(d => formatMonthLabel(d.month));

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (
          params: { seriesName: string; value: number; marker: string }[],
        ) => {
          const total = params.reduce((s, p) => s + p.value, 0);
          const lines = params.map(
            p => `${p.marker} ${p.seriesName}: ${fmt.format(p.value)}`,
          );
          lines.push(`<br/><strong>Gesamt: ${fmt.format(total)}</strong>`);
          return lines.join('<br/>');
        },
      },
      legend: {
        data: ['Fixkosten', 'Variable Ausgaben'],
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
          name: 'Fixkosten',
          type: 'bar',
          stack: 'costs',
          data: data.map(d => d.fixed),
          itemStyle: { color: '#8b5cf6' },
          barMaxWidth: 40,
        },
        {
          name: 'Variable Ausgaben',
          type: 'bar',
          stack: 'costs',
          data: data.map(d => d.variable),
          itemStyle: { color: '#06b6d4' },
          barMaxWidth: 40,
        },
      ],
    };
  }, [data]);

  return (
    <ChartContainer
      title="Fixkosten vs. Variable Ausgaben"
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
