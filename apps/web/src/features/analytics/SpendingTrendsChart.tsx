import { useMemo, useState } from 'react';

import ReactECharts from 'echarts-for-react';

import type { TrendPoint } from '../../core/types/finance';
import { ChartContainer } from './ChartContainer';
import { THEME_NAME, SERIES_COLORS } from './chart-theme';

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

type SpendingTrendsChartProps = {
  data: TrendPoint[] | undefined;
  isLoading: boolean;
  error: Error | null;
};

export function SpendingTrendsChart({
  data,
  isLoading,
  error,
}: SpendingTrendsChartProps) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    new Set(),
  );

  // Group by category, rank by total spending, default to top 5
  const { categories, months, seriesByCategory } = useMemo(() => {
    if (!data || data.length === 0) {
      return { categories: [], months: [], seriesByCategory: new Map() };
    }

    // Collect unique months (sorted)
    const monthSet = new Set<string>();
    const catTotals = new Map<string, { name: string; total: number }>();
    const byCat = new Map<string, Map<string, number>>();

    for (const point of data) {
      monthSet.add(point.month);

      const existing = catTotals.get(point.category_id) ?? {
        name: point.category_name,
        total: 0,
      };
      existing.total += point.total;
      catTotals.set(point.category_id, existing);

      const monthMap =
        byCat.get(point.category_id) ?? new Map<string, number>();
      monthMap.set(
        point.month,
        (monthMap.get(point.month) ?? 0) + point.total,
      );
      byCat.set(point.category_id, monthMap);
    }

    const sortedMonths = Array.from(monthSet).sort();
    const sortedCategories = Array.from(catTotals.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([id, info]) => ({ id, name: info.name, total: info.total }));

    return {
      categories: sortedCategories,
      months: sortedMonths,
      seriesByCategory: byCat,
    };
  }, [data]);

  // Stable color map: assign colors by rank in the full category list (not filtered)
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat, i) => {
      map.set(cat.id, SERIES_COLORS[i % SERIES_COLORS.length]);
    });
    return map;
  }, [categories]);

  const visibleCategories = useMemo(() => {
    return categories.filter(c => !hiddenCategories.has(c.id));
  }, [categories, hiddenCategories]);

  function toggleCategory(catId: string) {
    setHiddenCategories(prev => {
      const next = new Set(prev);
      if (next.has(catId)) {
        next.delete(catId);
      } else {
        next.add(catId);
      }
      return next;
    });
  }

  const option = useMemo(() => {
    if (months.length === 0) return {};

    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (
          params: { seriesName: string; value: number; marker: string }[],
        ) =>
          params
            .filter(p => p.value > 0)
            .map(p => `${p.marker} ${p.seriesName}: ${fmt.format(p.value)}`)
            .join('<br/>'),
      },
      legend: { show: false },
      xAxis: {
        type: 'category' as const,
        data: months.map(formatMonthLabel),
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          formatter: (v: number) => fmt.format(v),
        },
      },
      series: visibleCategories.map(cat => {
        const monthMap = seriesByCategory.get(cat.id);
        const color = colorMap.get(cat.id) ?? SERIES_COLORS[0];
        return {
          name: cat.name,
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 2, color },
          itemStyle: { color },
          data: months.map(m => monthMap?.get(m) ?? 0),
        };
      }),
    };
  }, [months, visibleCategories, seriesByCategory, colorMap]);

  return (
    <ChartContainer
      title="Ausgabentrends"
      isLoading={isLoading}
      error={error}
    >
      {/* Category filter checkboxes */}
      {categories.length > 0 && (
        <div
          className="flex flex-wrap gap-2 mb-3"
          role="group"
          aria-label="Kategorie-Filter"
        >
          {categories.map(cat => {
            const isVisible = !hiddenCategories.has(cat.id);
            const color = colorMap.get(cat.id) ?? SERIES_COLORS[0];
            return (
              <label
                key={cat.id}
                className={`fo-row px-2 py-1 rounded text-xs cursor-pointer transition-opacity ${
                  isVisible ? 'opacity-100' : 'opacity-40'
                }`}
                style={{
                  backgroundColor: isVisible
                    ? `${color}15`
                    : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isVisible ? `${color}40` : 'transparent'}`,
                }}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={isVisible}
                  onChange={() => toggleCategory(cat.id)}
                />
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1"
                  style={{ backgroundColor: color }}
                />
                {cat.name}
              </label>
            );
          })}
        </div>
      )}

      <ReactECharts
        option={option}
        theme={THEME_NAME}
        style={{ height: 400 }}
        notMerge
      />
    </ChartContainer>
  );
}
