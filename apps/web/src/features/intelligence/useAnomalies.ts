import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { listAnomalies, resolveAnomaly } from '../../core/api/finance-api';

export function useAnomalies(resolved?: boolean) {
  return useQuery({
    queryKey: ['anomalies', resolved],
    queryFn: () => listAnomalies(resolved),
    refetchInterval: 30_000,
  });
}

export function useResolveAnomaly() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resolveAnomaly,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anomalies'] });
    },
  });
}
