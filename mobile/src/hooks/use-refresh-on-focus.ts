import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/**
 * Tab screens stay mounted in expo-router, so React Query's mount refetch
 * never fires again after the first visit and AppState-based focus (see
 * _layout.tsx) only covers backgrounding the whole app. This is the React
 * Query-documented RN pattern: refetch on navigation focus, skipping the
 * first one (mount already fetched).
 */
export function useRefreshOnFocus<T>(refetch: () => Promise<T>) {
  const firstTimeRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstTimeRef.current) {
        firstTimeRef.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );
}
