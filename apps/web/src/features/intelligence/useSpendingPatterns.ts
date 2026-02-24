import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  listSpendingPatterns,
  dismissSpendingPattern,
} from '../../core/api/finance-api';

export function useSpendingPatterns(dismissed?: boolean) {
  return useQuery({
    queryKey: ['spending-patterns', dismissed],
    queryFn: () => listSpendingPatterns(dismissed),
    refetchInterval: 60_000,
  });
}

export function useDismissPattern() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dismissSpendingPattern,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spending-patterns'] });
    },
  });
}
