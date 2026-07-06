import { db } from '@/db/client';
import { professionalProfiles } from '@/db/schema';
import { discoveratsBoardsFromText } from './atsRegistry';
import { collectDiscoveryHtml } from './webSearchScraper';
import { extractAtsBoardTokens } from './atsTokenPatterns';

const ATS_DOMAINS = [
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.lever.co',
  'jobs.ashbyhq.com',
  'jobs.smartrecruiters.com',
  'recruitee.com',
];

// Generic fallbacks so discovery still works before any profile exists.
const DEFAULT_TERMS = [
  'remote', 'startup', 'hiring', 'careers', 'jobs',
  'Latam', 'Spain', 'Mexico', 'Colombia', 'Argentina', 'Chile', 'Europe',
];

// More queries per run = wider coverage. The ATS APIs aren't rate-limited; only
// the search engines are, which we mitigate via throttling + two engines.
const QUERIES_PER_RUN = 12;

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Builds discovery queries from the aggregated target countries and roles of all
 * users (so boards we surface match real demand), crossed with every supported
 * ATS domain. Falls back to generic terms when no profile data is available.
 */
export async function buildDiscoveryQueries(): Promise<string[]> {
  let countries: string[] = [];
  let roles: string[] = [];

  try {
    const profiles = await db
      .select({
        targetCountries: professionalProfiles.targetCountries,
        targetRoles: professionalProfiles.targetRoles,
      })
      .from(professionalProfiles);
    countries = dedupe(profiles.flatMap((p) => p.targetCountries ?? []));
    roles = dedupe(profiles.flatMap((p) => p.targetRoles ?? []));
  } catch (error) {
    console.warn('[ATS AutoDiscovery] Could not load profiles for query personalization:', error);
  }

  const terms = dedupe([...countries, ...roles.slice(0, 10), ...DEFAULT_TERMS]);

  const queries: string[] = [];
  for (const domain of ATS_DOMAINS) {
    for (const term of terms) {
      queries.push(`"${domain}" ${term}`);
    }
  }

  return shuffle(queries);
}

/**
 * Pure (no-DB) helper: run a set of queries through the web and return the ATS
 * board tokens found, grouped by platform. Used by the live verification script.
 */
export async function collectBoardTokensFromWeb(queries: string[]) {
  const html = await collectDiscoveryHtml(queries, { pagesPerQuery: 2 });
  const tokens = extractAtsBoardTokens(html);
  const byPlatform: Record<string, Set<string>> = {};
  for (const { platform, token } of tokens) {
    (byPlatform[platform] ??= new Set()).add(token);
  }
  return { total: tokens.length, byPlatform, htmlLength: html.length };
}

export async function searchAtsWeb() {
  console.log('[ATS AutoDiscovery] Starting web search for new ATS boards...');

  const allQueries = await buildDiscoveryQueries();
  const queries = allQueries.slice(0, QUERIES_PER_RUN);
  if (queries.length === 0) {
    return { success: false, message: 'No discovery queries could be built' };
  }

  console.log(`[ATS AutoDiscovery] Running ${queries.length} queries across ${ATS_DOMAINS.length} ATS domains...`);
  const html = await collectDiscoveryHtml(queries, { pagesPerQuery: 2 });
  if (!html) {
    return { success: false, message: 'Search engines returned no HTML', queriesRun: queries.length };
  }

  // discoveratsBoardsFromText extracts greenhouse/lever/ashby/smartrecruiters/
  // recruitee tokens, dedups against the DB, and validates new ones per platform.
  const discoveries = await discoveratsBoardsFromText({ text: html, sourceType: 'discovery' });

  const validCount = discoveries.filter((d) => d.ok).length;
  const byPlatform = discoveries.reduce<Record<string, number>>((acc, d) => {
    acc[d.platform] = (acc[d.platform] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[ATS AutoDiscovery] Finished. ${discoveries.length} tokens (${validCount} valid). By platform:`, byPlatform);

  return { success: true, validCount, totalFound: discoveries.length, byPlatform, queriesRun: queries.length };
}
