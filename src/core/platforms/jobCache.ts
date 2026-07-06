import { NormalizedVacancy } from '../scoring/fitScorer';
import { SearchFilters } from './PlatformAdapter';
import { getActiveAtsBoardTokens } from './atsRegistry';
import { GreenhouseAdapter } from './greenhouse';
import { LeverAdapter } from './lever';
import { AshbyAdapter } from './ashby';
import { RecruiteeAdapter } from './recruitee';
import { SmartRecruitersAdapter } from './smartrecruiters';
import { filterRankLimit } from './atsSearchHelpers';

/**
 * Shared in-memory job cache. The worker fetches every active board ONCE per
 * cycle into this cache; each user's search then scores against the cache
 * locally instead of re-fetching the same boards. This removes the N× redundant
 * fetching when many users search.
 *
 * SmartRecruiters is intentionally NOT cached: it needs a per-posting detail
 * fetch to get descriptions, and it has few boards, so it stays on the live
 * per-user path.
 */
const CACHED_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'recruitee'] as const;
const cachedAdapters = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
  recruitee: new RecruiteeAdapter(),
};
const smartRecruitersAdapter = new SmartRecruitersAdapter();

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PER_PLATFORM_LIMIT = 20000;
const MAX_DESCRIPTION_CHARS = 5000; // bound memory; scoring keywords sit early in the text

let cache: NormalizedVacancy[] = [];
let cachedAt = 0;

function truncate(job: NormalizedVacancy): NormalizedVacancy {
  if ((job.description?.length ?? 0) <= MAX_DESCRIPTION_CHARS) return job;
  return { ...job, description: job.description.slice(0, MAX_DESCRIPTION_CHARS) };
}

/** Fetches every active board once and replaces the cache. Returns counts. */
export async function refreshJobCache(): Promise<{ total: number; byPlatform: Record<string, number> }> {
  const all: NormalizedVacancy[] = [];
  const byPlatform: Record<string, number> = {};

  for (const name of CACHED_PLATFORMS) {
    const tokens = await getActiveAtsBoardTokens(name, 5000);
    if (!tokens.length) { byPlatform[name] = 0; continue; }
    try {
      const jobs = await cachedAdapters[name].search({ boardTokens: tokens, roles: [], locations: [], limit: PER_PLATFORM_LIMIT });
      byPlatform[name] = jobs.length;
      for (const job of jobs) all.push(truncate(job));
    } catch (error) {
      console.warn(`[JobCache] Failed to refresh ${name}:`, (error as Error)?.message ?? error);
      byPlatform[name] = 0;
    }
  }

  cache = all;
  cachedAt = Date.now();
  return { total: all.length, byPlatform };
}

export function isJobCacheFresh(): boolean {
  return cache.length > 0 && Date.now() - cachedAt < CACHE_TTL_MS;
}

export function jobCacheSize(): number {
  return cache.length;
}

/**
 * Per-user candidate gathering. Filters/ranks the shared cache for this user
 * (no network), then adds live SmartRecruiters results (few boards).
 */
export async function gatherSearchCandidates(input: {
  roles: string[];
  locations: string[];
  homeCountries?: string[];
  maxAgeDays?: number;
  limit?: number;
  smartRecruitersTokens: string[];
}): Promise<NormalizedVacancy[]> {
  const filters: SearchFilters = {
    roles: input.roles,
    locations: input.locations,
    homeCountries: input.homeCountries,
    maxAgeDays: input.maxAgeDays,
    limit: input.limit ?? 150,
  };

  const fromCache = filterRankLimit(cache, filters);

  let sr: NormalizedVacancy[] = [];
  if (input.smartRecruitersTokens.length) {
    try {
      sr = await smartRecruitersAdapter.search({ boardTokens: input.smartRecruitersTokens, ...filters });
    } catch (error) {
      console.warn('[JobCache] SmartRecruiters live fetch failed:', (error as Error)?.message ?? error);
    }
  }

  return filterRankLimit([...fromCache, ...sr], filters);
}
