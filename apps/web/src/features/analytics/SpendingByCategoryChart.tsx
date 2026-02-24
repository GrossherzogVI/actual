import { useMemo, useState } from 'react';

import ReactECharts from 'echarts-for-react';
import { ArrowLeft } from 'lucide-react';

import type { CategorySpending } from '../../core/types/finance';
import { ChartContainer } from './ChartContainer';
import { THEME_NAME, SERIES_COLORS } from './chart-theme';

const fmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

type SpendingByCategoryChartProps = {
  data: CategorySpending[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

export function SpendingByCategoryChart({
  data,
  isLoading,
  error,
}: SpendingByCategoryChartProps) {
  const [drillParent, setDrillParent] = useState<string | null>(null);

  // Group into L1 (no parent) and L2 (has parent)
  const { l1Items, l2ByParent } = useMemo(() => {
    if (!data) return { l1Items: [], l2ByParent: new Map() };

    const l1: CategorySpending[] = [];
    const l2Map = new Map<string, CategorySpending[]>();

    for (const item of data) {
      if (item.parent_id) {
        const existing = l2Map.get(item.parent_id) ?? [];
        existing.push(item);
        l2Map.set(item.parent_id, existing);
      } else {
        l1.push(item);
      }
    }

    // For L1 items, aggregate their L2 children totals
    const l1WithTotals = l1.map(item => {
      const children = l2Map.get(item.category_id);
      if (children) {
        const childTotal = children.reduce((s, c) => s + c.total, 0);
        // Use the larger of direct total vs child total to be accurate
        return { ...item, total: Math.max(item.total, childTotal) };
      }
      return item;
    });

    return { l1Items: l1WithTotals, l2ByParent: l2Map };
  }, [data]);

  const isDrilled = drillParent !== null;
  const drilledItems = isDrilled
    ? (l2ByParent.get(drillParent) ?? []).sort((a, b) => b.total - a.total)
    : [];
  const drilledParentName =
    isDrilled
      ? l1Items.find(i => i.category_id === drillParent)?.category_name ??
        'Kategorie'
      : '';

  // Treemap option for L1 overview
  const treemapOption = useMemo(() => {
    if (isDrilled || !l1Items.length) return {};
    return {
      tooltip: {
        formatter: (params: { name: string; value: number }) =>
          `<strong>${params.name}</strong><br/>${fmt.format(params.value)}`,
      },
      series: [
        {
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: {
            show: true,
            formatter: '{b}',
            fontSize: 12,
            color: '#fff',
          },
          itemStyle: {
            borderColor: 'rgba(0,0,0,0.3)',
            borderWidth: 2,
            gapWidth: 2,
          },
          data: l1Items.map((item, i) => ({
            name: item.category_name,
            value: item.total,
            categoryId: item.category_id,
            itemStyle: {
              color: SERIES_COLORS[i % SERIES_COLORS.length],
            },
          })),
        },
      ],
    };
  }, [l1Items, isDrilled]);

  // Bar option for L2 drill-down
  const barOption = useMemo(() => {
    if (!isDrilled || !drilledItems.length) return {};
    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: { name: string; value: number }[]) => {
          const p = params[0];
          return `<strong>${p.name}</strong><br/>${fmt.format(p.value)}`;
        },
      },
      xAxis: {
        type: 'category' as const,
        data: drilledItems.map(d => d.category_name),
        axisLabel: {
          rotate: drilledItems.length > 6 ? 30 : 0,
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          formatter: (v: number) => fmt.format(v),
        },
      },
      series: [
        {
          type: 'bar',
          data: drilledItems.map((d, i) => ({
            value: d.total,
            itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
          })),
          barMaxWidth: 48,
          label: {
            show: true,
            position: 'top' as const,
            formatter: (p: { value: number }) => fmt.format(p.value),
            fontSize: 10,
          },
        },
      ],
    };
  }, [isDrilled, drilledItems]);

  function handleTreemapClick(params: {
    data?: { categoryId?: string };
  }) {
    const catId = params.data?.categoryId;
    if (catId && l2ByParent.has(catId)) {
      setDrillParent(catId);
    }
  }

  return (
    <ChartContainer
      title="Ausgaben nach Kategorie"
      isLoading={isLoading}
      error={error}
    >
      {isDrilled && (
        <div className="fo-row mb-2">
          <button
            type="button"
            className="fo-row px-3 py-1.5 rounded-md text-sm text-[var(--fo-muted)] hover:text-[var(--fo-text)] hover:bg-[rgba(255,255,255,0.03)] transition-colors"
            onClick={() => setDrillParent(null)}
          >
            <ArrowLeft size={14} />
            Zurueck
          </button>
          <span className="text-sm text-[var(--fo-text)] font-medium">
            {drilledParentName}
          </span>
        </div>
      )}

      {isDrilled ? (
        <ReactECharts
          option={barOption}
          theme={THEME_NAME}
          style={{ height: 400 }}
          notMerge
        />
      ) : (
        <ReactECharts
          option={treemapOption}
          theme={THEME_NAME}
          style={{ height: 400 }}
          notMerge
          onEvents={{ click: handleTreemapClick }}
        />
      )}
    </ChartContainer>
  );
}
