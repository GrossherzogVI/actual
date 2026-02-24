import { useQuery } from '@tanstack/react-query';

import { getBalanceProjection } from '../../core/api/finance-api';

export function useBalanceProjection(days: number = 30) {
  return useQuery({
    queryKey: ['balance-projection', days],
    queryFn: () => getBalanceProjection(days),
  });
}
