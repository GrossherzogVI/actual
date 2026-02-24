import { useEffect, useMemo, useState } from 'react';

import {
  BarChart3,
  GitCompareArrows,
  Layers,
  Store,
  TrendingUp,
  Workflow,
} from 'lucide-react';
import { motion } from 'motion/react';

import { registerChartTheme } from './chart-theme';
import { CategoryFlowChart } from './CategoryFlowChart';
import { FixedVsVariableChart } from './FixedVsVariableChart';
import { MonthlyOverviewChart } from './MonthlyOverviewChart';
import { SpendingByCategoryChart } from './SpendingByCategoryChart';
import { SpendingTrendsChart } from './SpendingTrendsChart';
import { TimeRangeSelector } from './TimeRangeSelector';
import { TopMerchantsChart } from './TopMerchantsChart';
import {
  useFixedVsVariable,
  useMonthlyOverview,
  useSpendingByCategory,
  useSpendingTrends,
  useTopMerchants,
  useWhatChanged,
} from './useAnalyticsData';
import { WhatChangedCard } from './WhatChangedCard';

type AnalyticsTab =
  | 'spending'
  | 'overview'
  | 'fixed-variable'
  | 'trends'
  | 'merchants'
  | 'changes';

const TABS: {
  id: AnalyticsTab;
  label: string;
  icon: typeof BarChart3;
}[] = [
  { id: 'spending', label: 'Ausgaben', icon: BarChart3 },
  { id: 'overview', label: 'Ueberblick', icon: Layers },
  { id: 'fixed-variable', label: 'Fix/Variabel', icon: GitCompareArrows },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'merchants', label: 'Haendler', icon: Store },
  { id: 'changes', label: 'Veraenderungen', icon: Workflow },
];

function getDateRange(months: number): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const start = new Date(
    now.getFullYear(),
    now.getMonth() - months + 1,
    1,
  );
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getCurrentAndPreviousMonth(): {
  currentMonth: string;
  previousMonth: string;
} {
  const now = new Date();
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previous = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  return { currentMonth: current, previousMonth: previous };
}

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('spending');
  const [months, setMonths] = useState(6);

  // Register the ECharts theme once
  useEffect(() => {
    registerChartTheme();
  }, []);

  const { startDate, endDate } = useMemo(
    () => getDateRange(months),
    [months],
  );
  const { currentMonth, previousMonth } = useMemo(
    () => getCurrentAndPreviousMonth(),
    [],
  );

  // Fetch data only for the active tab (spending also needed for overview's CategoryFlowChart)
  const spendingQuery = useSpendingByCategory(startDate, endDate, activeTab === 'spending' || activeTab === 'overview');
  const overviewQuery = useMonthlyOverview(months, activeTab === 'overview');
  const fixedVarQuery = useFixedVsVariable(months, activeTab === 'fixed-variable');
  const trendsQuery = useSpendingTrends(months, undefined, activeTab === 'trends');
  const merchantsQuery = useTopMerchants(startDate, endDate, 15, activeTab === 'merchants');
  const changesQuery = useWhatChanged(currentMonth, previousMonth, activeTab === 'changes');

  return (
    <motion.div
      className="p-5 h-full overflow-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <motion.header
        className="mb-5"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="fo-space-between">
          <h1 className="text-xl font-semibold tracking-tight m-0">
            Auswertungen
          </h1>
          <TimeRangeSelector value={months} onChange={setMonths} />
        </div>
      </motion.header>

      {/* Sub-tab navigation */}
      <nav className="flex gap-1 mb-5">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`fo-row px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-[rgba(255,255,255,0.08)] text-[var(--fo-text)]'
                  : 'text-[var(--fo-muted)] hover:text-[var(--fo-text)] hover:bg-[rgba(255,255,255,0.03)]'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div>
        {activeTab === 'spending' && (
          <SpendingByCategoryChart
            data={spendingQuery.data}
            isLoading={spendingQuery.isLoading}
            error={spendingQuery.error}
          />
        )}

        {activeTab === 'overview' && (
          <div className="fo-stack" style={{ gap: 20 }}>
            <MonthlyOverviewChart
              data={overviewQuery.data}
              isLoading={overviewQuery.isLoading}
              error={overviewQuery.error}
            />
            <CategoryFlowChart
              spending={spendingQuery.data}
              overview={overviewQuery.data}
              isLoading={spendingQuery.isLoading || overviewQuery.isLoading}
              error={spendingQuery.error ?? overviewQuery.error}
            />
          </div>
        )}

        {activeTab === 'fixed-variable' && (
          <FixedVsVariableChart
            data={fixedVarQuery.data}
            isLoading={fixedVarQuery.isLoading}
            error={fixedVarQuery.error}
          />
        )}

        {activeTab === 'trends' && (
          <SpendingTrendsChart
            data={trendsQuery.data}
            isLoading={trendsQuery.isLoading}
            error={trendsQuery.error}
          />
        )}

        {activeTab === 'merchants' && (
          <TopMerchantsChart
            data={merchantsQuery.data}
            isLoading={merchantsQuery.isLoading}
            error={merchantsQuery.error}
          />
        )}

        {activeTab === 'changes' && (
          <WhatChangedCard
            data={changesQuery.data}
            isLoading={changesQuery.isLoading}
            error={changesQuery.error}
            currentMonth={currentMonth}
            previousMonth={previousMonth}
          />
        )}
      </div>
    </motion.div>
  );
}
