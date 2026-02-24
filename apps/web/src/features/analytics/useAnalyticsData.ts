import { useQuery } from '@tanstack/react-query';

import {
  getSpendingByCategory,
  getMonthlyOverview,
  getFixedVsVariable,
  getSpendingTrends,
  getTopMerchants,
  getWhatChanged,
} from '../../core/api/finance-api';

export function useSpendingByCategory(startDate: string, endDate: string, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'spending-by-category', startDate, endDate],
    queryFn: () => getSpendingByCategory(startDate, endDate),
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 5 * 60_000,
  });
}

export function useMonthlyOverview(months: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'monthly-overview', months],
    queryFn: () => getMonthlyOverview(months),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useFixedVsVariable(months: number, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'fixed-vs-variable', months],
    queryFn: () => getFixedVsVariable(months),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSpendingTrends(months: number, categoryIds?: string[], enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'spending-trends', months, categoryIds],
    queryFn: () => getSpendingTrends(months, categoryIds),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useTopMerchants(
  startDate: string,
  endDate: string,
  limit?: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ['analytics', 'top-merchants', startDate, endDate, limit],
    queryFn: () => getTopMerchants(startDate, endDate, limit),
    enabled: enabled && !!startDate && !!endDate,
    staleTime: 5 * 60_000,
  });
}

export function useWhatChanged(currentMonth: string, previousMonth: string, enabled = true) {
  return useQuery({
    queryKey: ['analytics', 'what-changed', currentMonth, previousMonth],
    queryFn: () => getWhatChanged(currentMonth, previousMonth),
    enabled: enabled && !!currentMonth && !!previousMonth,
    staleTime: 5 * 60_000,
  });
}
