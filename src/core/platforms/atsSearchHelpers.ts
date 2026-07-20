import { NormalizedVacancy } from '../scoring/fitScorer';
import { SearchFilters } from './PlatformAdapter';
import { getRoleFamily, roleMatches } from '../scoring/roleTaxonomy';
import { detectRemoteScope, matchesCountry, geoPriority } from '../scoring/geography';
import { isLikelyFalsePositiveRole } from '../scoring/semanticRole';

/**
 * Shared search/normalization helpers for ATS adapters. The original three
 * adapters predate this module and inline their own copies; new adapters reuse
 * these to avoid drift.
 */

export function normalizeLocation(value: string): string {
  return value
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .trim();
}

export function matchesLocation(jobLocation: string, requestedLocation: string): boolean {
  if (!requestedLocation) return true;
  const normalizedJobLocation = normalizeLocation(jobLocation);
  const remoteScope = detectRemoteScope(jobLocation);
  if (matchesCountry(normalizedJobLocation, requestedLocation)) return true;
  if (remoteScope === 'global') return true;
  if (remoteScope === 'regional') return true;
  return false;
}

export function matchesFilters(job: NormalizedVacancy, filters: SearchFilters): boolean {
  const title = job.title.toLowerCase();
  const location = (job.location ?? '').toLowerCase();
  const roleMatch = !filters.roles?.length || filters.roles.some((role) => roleMatches(title, role));
  // A remote-accepting candidate should see EVERY remote posting in the pool,
  // not just globally/regionally-scoped ones. Without this, a candidate with
  // targetCountries=[Colombia,Panama] lost bare-"Remote" and "Remote US" roles
  // at the search stage - before the scorer, which reads the description and
  // is the right place to decide whether the hiring footprint includes them.
  const isRemote = filters.acceptsRemote && detectRemoteScope(job.location) !== 'not_remote';
  const locationMatch = !filters.locations?.length
    || isRemote
    || filters.locations.some((loc) => matchesLocation(location, loc));
  const ageMatch = !filters.maxAgeDays || !job.postedAt
    ? true
    : job.postedAt >= new Date(Date.now() - filters.maxAgeDays * 24 * 60 * 60 * 1000);
  return roleMatch && locationMatch && ageMatch;
}

export function searchRank(job: NormalizedVacancy, filters: SearchFilters): number {
  let score = 0;
  if (filters.roles?.some((role) => roleMatches(job.title, role))) score += 50;
  const matchedFamily = filters.roles
    ?.map((role) => getRoleFamily(role))
    .find((family) => family && family === getRoleFamily(job.title));
  if (isLikelyFalsePositiveRole(job.title, matchedFamily)) score -= 40;

  if (filters.homeCountries?.length) {
    // Local-first: home country dominates, foreign (US/Europe) ranks last.
    const geo = geoPriority(job.location, filters.homeCountries[0], filters.locations);
    score += geo.score * 4; // home=60, region_remote=52, region=44, global=40, foreign=16
  } else {
    if (filters.locations?.some((location) => matchesLocation(job.location ?? '', location))) score += 20;
    const remoteScope = detectRemoteScope(job.location);
    if (remoteScope === 'global') score += 15;
    if (remoteScope === 'regional') score += 10;
  }
  if (job.salaryMin) score += 5;
  if (job.postedAt) {
    const ageDays = (Date.now() - job.postedAt.getTime()) / (24 * 60 * 60 * 1000);
    score += Math.max(0, 15 - Math.min(ageDays, 15));
  }
  return score;
}

/** Filter -> rank -> limit, the shared tail of every adapter's search(). */
export function filterRankLimit(jobs: NormalizedVacancy[], filters: SearchFilters): NormalizedVacancy[] {
  // Compute searchRank ONCE per job (not per sort comparison) - critical when
  // ranking the full shared cache (tens of thousands of jobs).
  const ranked: Array<{ job: NormalizedVacancy; rank: number }> = [];
  for (const job of jobs) {
    if (matchesFilters(job, filters)) ranked.push({ job, rank: searchRank(job, filters) });
  }
  ranked.sort((a, b) => b.rank - a.rank);
  return ranked.slice(0, filters.limit ?? 10).map((r) => r.job);
}

/**
 * Identify which ATS an application URL belongs to (used to hand off a LinkedIn
 * external "Apply" to the right engine). Returns null for unknown/custom sites.
 */
export function detectPlatformFromUrl(url?: string | null): string | null {
  const u = (url ?? '').toLowerCase();
  if (!u) return null;
  if (/(^|\.)greenhouse\.io|boards\.greenhouse|job-boards\.greenhouse|grnh\.se/.test(u)) return 'greenhouse';
  if (/(^|\.)lever\.co|jobs\.lever/.test(u)) return 'lever';
  if (/ashbyhq\.com|jobs\.ashby/.test(u)) return 'ashby';
  if (/smartrecruiters\.com/.test(u)) return 'smartrecruiters';
  if (/recruitee\.com/.test(u)) return 'recruitee';
  if (/myworkdayjobs\.com|workday/.test(u)) return 'workday';
  if (/icims\.com/.test(u)) return 'icims';
  return null;
}

export function stripHtml(value: string): string {
  return value
    // Preserve structure: block-level tags become line breaks, list items get bullets.
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ') // collapse spaces/tabs but keep newlines
    .replace(/ *\n */g, '\n') // trim spaces around newlines
    .replace(/\n{3,}/g, '\n\n') // at most one blank line
    .trim();
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}
