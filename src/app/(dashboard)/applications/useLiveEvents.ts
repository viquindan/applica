'use client';
import { useEffect, useRef } from 'react';

export type SearchProgressEvent = {
  searchInProgress: boolean;
  lastSearchStatus: string | null;
  lastSearchResultCount: number;
  lastSearchPreparedCount: number;
  lastSearchFilteredCount: number;
  lastSearchSourceCount: number;
  lastSearchScannedSourceCount: number;
  lastSearchAt: string | null;
  lastSearchError: string | null;
};

/**
 * One shared SSE connection per dashboard page (src/app/api/events/route.ts)
 * for real-time application/search updates - replaces the client-side
 * polling timers that used to live in useApplicationActions/useSearchEngine.
 * Reconnects automatically on drop (native EventSource behavior); no manual
 * retry logic needed.
 */
export function useLiveEvents(opts: {
  onApplicationsChanged?: () => void;
  onSearchProgress?: (data: SearchProgressEvent) => void;
}) {
  const onAppsRef = useRef(opts.onApplicationsChanged);
  const onSearchRef = useRef(opts.onSearchProgress);
  onAppsRef.current = opts.onApplicationsChanged;
  onSearchRef.current = opts.onSearchProgress;

  useEffect(() => {
    const es = new EventSource('/api/events');
    es.addEventListener('applications_changed', () => onAppsRef.current?.());
    es.addEventListener('search_progress', (e) => {
      try { onSearchRef.current?.(JSON.parse((e as MessageEvent).data)); } catch {}
    });
    return () => es.close();
  }, []);
}
