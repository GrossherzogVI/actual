import { motion } from 'motion/react';
import ReactECharts from 'echarts-for-react';

import { useBalanceProjection } from './useBalanceProjection';

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

function buildChartOption(points: { date: string; balance: number }[]) {
  const dates = points.map(p => {
    const [, month, day] = p.date.split('-');
    return `${day}.${month}.`;
  });
  const balances = points.map(p => p.balance);

  return {
    backgroundColor: 'transparent',
    grid: { top: 16, right: 8, bottom: 28, left: 64 },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: 'var(--fo-border)' } },
      axisTick: { show: false },
      axisLabel: {
        color: 'var(--fo-muted)',
        fontSize: 10,
        interval: Math.floor(points.length / 6),
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'var(--fo-border)', type: 'dashed' } },
      axisLabel: {
        color: 'var(--fo-muted)',
        fontSize: 10,
        formatter: (val: number) =>
          new Intl.NumberFormat('de-DE', {
            notation: 'compact',
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          }).format(val),
      },
    },
    series: [
      {
        type: 'line',
        data: balances,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#8b5cf6', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(139, 92, 246, 0.3)' },
              { offset: 1, color: 'rgba(139, 92, 246, 0.02)' },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: 0 }],
          lineStyle: { color: 'var(--fo-danger)', type: 'dashed', width: 1.5 },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: '0 €',
            color: 'var(--fo-danger)',
            fontSize: 10,
          },
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--fo-bg-2)',
      borderColor: 'var(--fo-border)',
      textStyle: { color: 'var(--fo-text)', fontSize: 12 },
      formatter: (params: { name: string; value: number }[]) => {
        const p = params[0];
        return `${p.name}<br/><strong>${EUR.format(p.value)}</strong>`;
      },
    },
  };
}

export function BalanceProjectionWidget() {
  const { data: points, isLoading } = useBalanceProjection(30);

  if (isLoading) {
    return (
      <motion.section
        className="fo-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.18 }}
      >
        <header className="fo-panel-header">
          <h2>Kontostandsentwicklung</h2>
        </header>
        <div className="h-[200px] rounded-md bg-[var(--fo-bg)] animate-pulse" />
      </motion.section>
    );
  }

  const list = points ?? [];
  const minBalance = list.length > 0 ? Math.min(...list.map(p => p.balance)) : 0;
  const hasDanger = minBalance < 0;

  return (
    <motion.section
      className={`fo-panel${hasDanger ? ' border-t-2 border-t-red-500/60' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.18 }}
    >
      <header className="fo-panel-header">
        <h2>Kontostandsentwicklung</h2>
        <small>Prognose 30 Tage</small>
      </header>

      {list.length === 0 ? (
        <p className="text-sm text-[var(--fo-muted)]">Keine Planungen vorhanden.</p>
      ) : (
        <ReactECharts
          option={buildChartOption(list)}
          style={{ height: 200 }}
          opts={{ renderer: 'svg' }}
        />
      )}
    </motion.section>
  );
}
