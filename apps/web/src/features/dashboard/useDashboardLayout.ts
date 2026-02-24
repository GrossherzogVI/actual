import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getUserPref, setUserPref } from '../../core/api/finance-api';
import { DEFAULT_LAYOUT, type WidgetLayout } from './DashboardGrid';

const PREF_KEY = 'dashboard-layout';

export function useDashboardLayout() {
  const queryClient = useQueryClient();

  const { data: layout, isLoading } = useQuery({
    queryKey: ['user-pref', PREF_KEY],
    queryFn: async (): Promise<WidgetLayout[]> => {
      const raw = await getUserPref(PREF_KEY);
      if (!raw) return DEFAULT_LAYOUT;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed as WidgetLayout[];
        }
        return DEFAULT_LAYOUT;
      } catch {
        return DEFAULT_LAYOUT;
      }
    },
  });

  const { mutate: setLayout } = useMutation({
    mutationFn: (newLayout: WidgetLayout[]) =>
      setUserPref(PREF_KEY, JSON.stringify(newLayout)),
    onSuccess: (_data, newLayout) => {
      queryClient.setQueryData(['user-pref', PREF_KEY], newLayout);
    },
  });

  return {
    layout: layout ?? DEFAULT_LAYOUT,
    setLayout,
    isLoading,
  };
}
