import { api } from './client';

export type SearchStatus = {
  searchInProgress: boolean;
  lastSearchStatus: string | null;
  lastSearchResultCount: number | null;
  lastSearchPreparedCount: number | null;
  lastSearchFilteredCount: number | null;
  lastSearchSourceCount: number | null;
  lastSearchScannedSourceCount: number | null;
  lastSearchAt: string | null;
  lastSearchError: string | null;
};

export const getSearchStatus = () => api.get<SearchStatus>('/api/search/status');
