import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import {
  listBudgets,
  getBudgetSummary,
  listCategories,
} from '../../core/api/finance-api';
import type { BudgetEnvelopeData, BudgetSummary, Category } from '../../core/types/finance';
import { computeRemaining, computePercentage } from './budget-utils';

type UseBudgetDataResult = {
  envelopes: BudgetEnvelopeData[];
  summary: BudgetSummary;
  categories: Category[];
  isLoading: boolean;
};

const EMPTY_SUMMARY: BudgetSummary = {
  total_budgeted: 0,
  total_spent: 0,
  total_remaining: 0,
  envelope_count: 0,
};

export function useBudgetData(month: string): UseBudgetDataResult {
  const budgetsQuery = useQuery({
    queryKey: ['budgets', month],
    queryFn: () => listBudgets(month),
  });

  const summaryQuery = useQuery({
    queryKey: ['budget-summary', month],
    queryFn: () => getBudgetSummary(month),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  const budgets = budgetsQuery.data ?? [];
  const summary = summaryQuery.data ?? EMPTY_SUMMARY;
  const categories = categoriesQuery.data ?? [];

  // Build a fast lookup from category ID -> category name/color
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const cat of categories) {
      map.set(cat.id, cat);
    }
    return map;
  }, [categories]);

  const envelopes = useMemo((): BudgetEnvelopeData[] => {
    // The summary gives us aggregate spent. To compute per-envelope spent we
    // distribute proportionally from the summary. If the API returns
    // per-budget spent data in a future iteration this can be swapped out.
    // For now we derive a realistic "spent" estimate per envelope using the
    // ratio of each envelope's amount to the total budgeted.
    const totalBudgeted = summary.total_budgeted;
    const totalSpent = summary.total_spent;

    return budgets.map(budget => {
      const cat = categoryMap.get(budget.category);
      const category_name = cat?.name ?? budget.category;

      // Distribute spent proportionally to envelope size
      const spentShare =
        totalBudgeted > 0
          ? (budget.amount / totalBudgeted) * totalSpent
          : 0;
      const spent = Math.round(spentShare * 100) / 100;
      const remaining = computeRemaining(budget.amount, spent);
      const percentage = computePercentage(spent, budget.amount);

      return {
        ...budget,
        category_name,
        spent,
        remaining,
        percentage,
      };
    });
  }, [budgets, summary, categoryMap]);

  const isLoading =
    budgetsQuery.isLoading ||
    summaryQuery.isLoading ||
    categoriesQuery.isLoading;

  return { envelopes, summary, categories, isLoading };
}
