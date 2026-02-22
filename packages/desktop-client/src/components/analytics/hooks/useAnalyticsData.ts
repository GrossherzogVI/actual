// @ts-strict-ignore
import { useEffect, useMemo, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';
import { q } from 'loot-core/shared/query';
import * as monthUtils from 'loot-core/shared/months';
import type { CategoryEntity } from 'loot-core/types/models';

import { aqlQuery } from '@desktop-client/queries/aqlQuery';

// ── Types ───────────────────────────────────────────────────────────

type CategorySpending = {
  id: string;
  name: string;
  groupName: string;
  amount: number; // positive cents (absolute value of expenses)
  color: string;
};

type MonthlyTotals = {
  month: string; // YYYY-MM
  label: string; // "Jan 26"
  income: number; // positive cents
  expenses: number; // positive cents (absolute value)
  net: number; // income - expenses in cents
};

type FixedVsVariable = {
  fixed: number; // cents
  variable: number; // cents
  total: number; // cents
};

type TrendLine = {
  id: string;
  name: string;
  color: string;
  data: { month: string; label: string; amount: number }[];
};

type BudgetAlert = {
  categoryId: string;
  categoryName: string;
  budgeted: number; // cents
  spent: number; // positive cents
  overage: number; // positive cents
  overagePercent: number; // e.g. 15 for 15%
};

export type AnalyticsData = {
  loading: boolean;
  spendingByCategory: CategorySpending[];
  monthlyTotals: MonthlyTotals[];
  fixedVsVariable: FixedVsVariable;
  spendingTrends: TrendLine[];
  budgetAlerts: BudgetAlert[];
  totalSpentThisMonth: number;
  totalBudgetedThisMonth: number;
  leftToSpend: number;
};

// ── Color palette for charts ────────────────────────────────────────

const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#e11d48', // rose
];

function colorForIndex(i: number): string {
  return CHART_COLORS[i % CHART_COLORS.length];
}

// ── Month formatting ────────────────────────────────────────────────

function formatMonthLabel(month: string): string {
  const [y, m] = month.split('-');
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useAnalyticsData(): AnalyticsData {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryEntity[]>([]);
  const [spendingByCategory, setSpendingByCategory] = useState<CategorySpending[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals[]>([]);
  const [fixedVsVariable, setFixedVsVariable] = useState<FixedVsVariable>({
    fixed: 0,
    variable: 0,
    total: 0,
  });
  const [spendingTrends, setSpendingTrends] = useState<TrendLine[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [totalSpentThisMonth, setTotalSpentThisMonth] = useState(0);
  const [totalBudgetedThisMonth, setTotalBudgetedThisMonth] = useState(0);

  const currentMonth = monthUtils.currentMonth();

  // Compute 6-month range: 5 months ago through current
  const months = useMemo(() => {
    const result: string[] = [];
    for (let i = 5; i >= 0; i--) {
      result.push(monthUtils.subMonths(currentMonth, i));
    }
    return result;
  }, [currentMonth]);

  useEffect(() => {
    let cancelled = false;

    async function fetchAll() {
      setLoading(true);

      // 1) Categories
      const { list: cats, grouped } = await send('get-categories');
      if (cancelled) return;

      const expenseCats: CategoryEntity[] = cats.filter(
        (c: CategoryEntity) => !c.is_income && !c.hidden,
      );
      setCategories(expenseCats);

      // Build group name map
      const groupMap = new Map<string, string>();
      for (const g of grouped) {
        for (const c of g.categories) {
          groupMap.set(c.id, g.name);
        }
      }

      // 2) Spending by category for current month
      const startOfMonth = monthUtils.firstDayOfMonth(currentMonth);
      const today = monthUtils.currentDay();

      const catSpending: CategorySpending[] = [];
      for (const cat of expenseCats) {
        const { data: sum } = await aqlQuery(
          q('transactions')
            .filter({
              $and: [
                { date: { $gte: startOfMonth } },
                { date: { $lte: today } },
                { category: cat.id },
              ],
              'account.offbudget': false,
              'payee.transfer_acct': null,
            })
            .filter({ amount: { $lt: 0 } })
            .calculate({ $sum: '$amount' }),
        );
        const absAmount = Math.abs(sum || 0);
        if (absAmount > 0) {
          catSpending.push({
            id: cat.id,
            name: cat.name,
            groupName: groupMap.get(cat.id) || '',
            amount: absAmount,
            color: '', // assigned below
          });
        }
      }

      // Sort descending, assign colors
      catSpending.sort((a, b) => b.amount - a.amount);
      catSpending.forEach((cs, i) => {
        cs.color = colorForIndex(i);
      });
      if (!cancelled) setSpendingByCategory(catSpending);

      // Total spent this month
      const totalSpent = catSpending.reduce((s, c) => s + c.amount, 0);
      if (!cancelled) setTotalSpentThisMonth(totalSpent);

      // 3) Monthly income vs expenses for last 6 months
      const monthlyData: MonthlyTotals[] = [];
      for (const month of months) {
        const start = monthUtils.firstDayOfMonth(month);
        const end =
          month === currentMonth
            ? today
            : monthUtils.lastDayOfMonth(month);

        const [incomeResult, expenseResult] = await Promise.all([
          aqlQuery(
            q('transactions')
              .filter({
                $and: [
                  { date: { $gte: start } },
                  { date: { $lte: end } },
                ],
                'account.offbudget': false,
                'payee.transfer_acct': null,
              })
              .filter({ amount: { $gt: 0 } })
              .calculate({ $sum: '$amount' }),
          ),
          aqlQuery(
            q('transactions')
              .filter({
                $and: [
                  { date: { $gte: start } },
                  { date: { $lte: end } },
                ],
                'account.offbudget': false,
                'payee.transfer_acct': null,
              })
              .filter({ amount: { $lt: 0 } })
              .calculate({ $sum: '$amount' }),
          ),
        ]);

        const income = incomeResult.data || 0;
        const expenses = Math.abs(expenseResult.data || 0);

        monthlyData.push({
          month,
          label: formatMonthLabel(month),
          income,
          expenses,
          net: income - expenses,
        });
      }
      if (!cancelled) setMonthlyTotals(monthlyData);

      // 4) Fixed vs Variable (contracts)
      let fixedAmount = 0;
      try {
        const contracts = await (send as Function)('contract-list');
        if (Array.isArray(contracts)) {
          for (const c of contracts) {
            if (c.status === 'active' && c.amount != null) {
              // Normalize to monthly amount
              let monthly = Math.abs(c.amount);
              switch (c.interval) {
                case 'weekly':
                  monthly = monthly * 4.33;
                  break;
                case 'quarterly':
                  monthly = monthly / 3;
                  break;
                case 'semi-annual':
                  monthly = monthly / 6;
                  break;
                case 'annual':
                  monthly = monthly / 12;
                  break;
              }
              fixedAmount += Math.round(monthly);
            }
          }
        }
      } catch {
        // contracts module might not be available
      }
      const variableAmount = Math.max(0, totalSpent - fixedAmount);
      if (!cancelled) {
        setFixedVsVariable({
          fixed: fixedAmount,
          variable: variableAmount,
          total: totalSpent,
        });
      }

      // 5) Spending trends: top 5 categories over 6 months
      const top5 = catSpending.slice(0, 5);
      const trendLines: TrendLine[] = [];
      for (const cat of top5) {
        const dataPoints: TrendLine['data'] = [];
        for (const month of months) {
          const start = monthUtils.firstDayOfMonth(month);
          const end =
            month === currentMonth
              ? today
              : monthUtils.lastDayOfMonth(month);

          const { data: sum } = await aqlQuery(
            q('transactions')
              .filter({
                $and: [
                  { date: { $gte: start } },
                  { date: { $lte: end } },
                  { category: cat.id },
                ],
                'account.offbudget': false,
                'payee.transfer_acct': null,
              })
              .filter({ amount: { $lt: 0 } })
              .calculate({ $sum: '$amount' }),
          );
          dataPoints.push({
            month,
            label: formatMonthLabel(month),
            amount: Math.abs(sum || 0),
          });
        }
        trendLines.push({
          id: cat.id,
          name: cat.name,
          color: cat.color,
          data: dataPoints,
        });
      }
      if (!cancelled) setSpendingTrends(trendLines);

      // 6) Budget alerts — categories where spending > budgeted
      try {
        const monthData = await send('envelope-budget-month', {
          month: currentMonth,
        });
        const alerts: BudgetAlert[] = [];
        let totalBudgeted = 0;

        for (const cat of expenseCats) {
          const budgetCell = monthData.find((cell: { name: string }) =>
            cell.name.endsWith(`budget-${cat.id}`),
          );
          const spentCell = monthData.find((cell: { name: string }) =>
            cell.name.endsWith(`sum-amount-${cat.id}`),
          );

          const budgeted = (budgetCell?.value as number) || 0;
          const spent = Math.abs((spentCell?.value as number) || 0);
          totalBudgeted += budgeted;

          if (budgeted > 0 && spent > budgeted) {
            const overage = spent - budgeted;
            alerts.push({
              categoryId: cat.id,
              categoryName: cat.name,
              budgeted,
              spent,
              overage,
              overagePercent: Math.round((overage / budgeted) * 100),
            });
          }
        }
        alerts.sort((a, b) => b.overagePercent - a.overagePercent);
        if (!cancelled) {
          setBudgetAlerts(alerts);
          setTotalBudgetedThisMonth(totalBudgeted);
        }
      } catch {
        // Budget data might not be available
      }

      if (!cancelled) setLoading(false);
    }

    void fetchAll();

    return () => {
      cancelled = true;
    };
  }, [currentMonth, months]);

  const leftToSpend = totalBudgetedThisMonth - totalSpentThisMonth;

  return {
    loading,
    spendingByCategory,
    monthlyTotals,
    fixedVsVariable,
    spendingTrends,
    budgetAlerts,
    totalSpentThisMonth,
    totalBudgetedThisMonth,
    leftToSpend,
  };
}
