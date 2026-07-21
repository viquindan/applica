import { api } from './client';

// Real funnel telemetry from the last search_vacancies run, computed FROM
// the actual pipeline as it executes (see docs/SEARCH-ENGINE.md) - never a
// separate estimate that could drift from what really happened.
export type SearchFunnel = {
  universe: number;
  expertiseMatch: number;
  regionMatch: number;
  eligible: number;
  highConfidence: number;
  goodMatch: number;
};

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
  lastSearchFunnel: SearchFunnel | null;
};

export const getSearchStatus = () => api.get<SearchStatus>('/api/search/status');
