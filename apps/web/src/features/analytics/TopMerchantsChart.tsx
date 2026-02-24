import { useMemo } from 'react';

import ReactECharts from 'echarts-for-react';

import type { MerchantSpending } from '../../core/types/finance';
import { ChartContainer } from './ChartContainer';
import { THEME_NAME, SERIES_COLORS } from './chart-theme';

const fmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

type TopMerchantsChartProps = {
  data: MerchantSpending[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

export function TopMerchantsChart({
  data,
  isLoading,
  error,
}: TopMerchantsChartProps) {
  const option = useMemo(() => {
    if (!data || data.length === 0) return {};

    // Reverse so highest is at top in horizontal bar
    const sorted = [...data].reverse();

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: { name: string; value: number }[]) => {
          const p = params[0];
          const item = data.find(d => d.payee_name === p.name);
          const count = item?.count ?? 0;
          return `<strong>${p.name}</strong><br/>${fmt.format(p.value)}<br/>${count} Transaktionen`;
        },
      },
      grid: {
        left: 12,
        right: 80,
        top: 8,
        bottom: 8,
        containLabel: true,
      },
      xAxis: {
        type: 'value' as const,
        axisLabel: {
          formatter: (v: number) => fmt.format(v),
        },
      },
      yAxis: {
        type: 'category' as const,
        data: sorted.map(d => d.payee_name),
        axisLabel: {
          fontSize: 11,
          width: 120,
          overflow: 'truncate' as const,
        },
      },
      series: [
        {
          type: 'bar',
          data: sorted.map((d, i) => ({
            value: d.total,
            itemStyle: {
              color: SERIES_COLORS[
                (sorted.length - 1 - i) % SERIES_COLORS.length
              ],
            },
          })),
          barMaxWidth: 24,
          label: {
            show: true,
            position: 'right' as const,
            formatter: (p: { value: number }) => fmt.format(p.value),
            fontSize: 10,
          },
        },
      ],
    };
  }, [data]);

  const chartHeight = Math.max(300, (data?.length ?? 0) * 36);

  return (
    <ChartContainer
      title="Top Haendler"
      isLoading={isLoading}
      error={error}
      height={chartHeight}
    >
      <ReactECharts
        option={option}
        theme={THEME_NAME}
        style={{ height: chartHeight }}
        notMerge
      />
    </ChartContainer>
  );
}
