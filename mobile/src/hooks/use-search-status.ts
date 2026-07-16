import { useQuery } from '@tanstack/react-query';

import { getSearchStatus } from '@/api/search';

/** Polls the real backend search progress (same fields the web funnel uses) while a search is running. */
export function useSearchStatus(enabled: boolean) {
  return useQuery({
    queryKey: ['searchStatus'],
    queryFn: getSearchStatus,
    enabled,
    refetchInterval: enabled ? 2000 : false,
  });
}
