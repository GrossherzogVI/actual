import { useMemo } from 'react';

import ReactECharts from 'echarts-for-react';

import type { CategorySpending, MonthSummary } from '../../core/types/finance';
import { ChartContainer } from './ChartContainer';
import { THEME_NAME, SERIES_COLORS } from './chart-theme';

const fmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

type CategoryFlowChartProps = {
  spending: CategorySpending[] | undefined;
  overview: MonthSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

export function CategoryFlowChart({
  spending,
  overview,
  isLoading,
  error,
}: CategoryFlowChartProps) {
  const option = useMemo(() => {
    if (!spending || spending.length === 0) return {};

    // Calculate total income from overview data
    const totalIncome =
      overview?.reduce((s, m) => s + m.income, 0) ?? 0;

    // Use only L1 categories (no parent) or all if no hierarchy exists
    const expenseCategories = spending
      .filter(s => !s.parent_id)
      .slice(0, 10); // top 10

    // Build sankey nodes: income source on left, expense categories on right
    const nodes: { name: string }[] = [{ name: 'Einkommen' }];
    for (const cat of expenseCategories) {
      nodes.push({ name: cat.category_name });
    }

    // Remaining amount not allocated to top categories
    const allocatedTotal = expenseCategories.reduce((s, c) => s + c.total, 0);
    const remainingIncome = totalIncome > allocatedTotal
      ? totalIncome - allocatedTotal
      : 0;

    if (remainingIncome > 0) {
      nodes.push({ name: 'Uebrig / Sparen' });
    }

    // Build links
    const links: { source: string; target: string; value: number }[] = [];
    for (const cat of expenseCategories) {
      links.push({
        source: 'Einkommen',
        target: cat.category_name,
        value: cat.total,
      });
    }
    if (remainingIncome > 0) {
      links.push({
        source: 'Einkommen',
        target: 'Uebrig / Sparen',
        value: remainingIncome,
      });
    }

    // Avoid empty chart when no links
    if (links.length === 0) return {};

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: {
          data?: { source?: string; target?: string; value?: number };
          name?: string;
          value?: number;
        }) => {
          if (params.data?.source && params.data?.target) {
            return `${params.data.source} → ${params.data.target}<br/>${fmt.format(params.data.value ?? 0)}`;
          }
          return `${params.name}: ${fmt.format(params.value ?? 0)}`;
        },
      },
      series: [
        {
          type: 'sankey',
          layout: 'none',
          emphasis: { focus: 'adjacency' as const },
          nodeAlign: 'left' as const,
          orient: 'horizontal' as const,
          nodeGap: 12,
          nodeWidth: 20,
          label: {
            color: 'var(--fo-text)',
            fontSize: 11,
          },
          lineStyle: {
            color: 'gradient' as const,
            opacity: 0.3,
            curveness: 0.5,
          },
          itemStyle: {
            borderWidth: 0,
          },
          data: nodes.map((n, i) => ({
            ...n,
            itemStyle: {
              color:
                n.name === 'Einkommen'
                  ? '#10b981'
                  : n.name === 'Uebrig / Sparen'
                    ? '#3b82f6'
                    : SERIES_COLORS[(i - 1) % SERIES_COLORS.length],
            },
          })),
          links,
        },
      ],
    };
  }, [spending, overview]);

  return (
    <ChartContainer
      title="Geldfluss"
      isLoading={isLoading}
      error={error}
      height={450}
    >
      <ReactECharts
        option={option}
        theme={THEME_NAME}
        style={{ height: 450 }}
        notMerge
      />
    </ChartContainer>
  );
}
