import * as echarts from 'echarts';

const THEME_NAME = 'financeOS';

const SERIES_COLORS = [
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#ec4899',
  '#3b82f6',
  '#f97316',
];

function getCSSVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const val = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return val || fallback;
}

function buildTheme(): Record<string, unknown> {
  const textColor = getCSSVar('--fo-text', '#e2e8f0');
  const mutedColor = getCSSVar('--fo-muted', '#94a3b8');
  const splitLineColor = 'rgba(255,255,255,0.06)';

  return {
    color: SERIES_COLORS,
    backgroundColor: 'transparent',
    textStyle: {
      color: textColor,
      fontFamily:
        'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    },
    title: {
      textStyle: { color: textColor, fontSize: 14, fontWeight: 600 },
      subtextStyle: { color: mutedColor, fontSize: 12 },
    },
    legend: {
      textStyle: { color: mutedColor, fontSize: 11 },
      pageTextStyle: { color: mutedColor },
    },
    tooltip: {
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      textStyle: { color: textColor, fontSize: 12 },
      extraCssText: 'backdrop-filter: blur(8px); border-radius: 8px;',
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: splitLineColor } },
      axisTick: { show: false },
      axisLabel: { color: mutedColor, fontSize: 11 },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: mutedColor, fontSize: 11 },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    grid: {
      left: 12,
      right: 12,
      top: 32,
      bottom: 8,
      containLabel: true,
    },
  };
}

let registered = false;

export function registerChartTheme(): void {
  if (registered) return;
  echarts.registerTheme(THEME_NAME, buildTheme());
  registered = true;
}

export { THEME_NAME, SERIES_COLORS };
