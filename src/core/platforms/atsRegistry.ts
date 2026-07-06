import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { atsBoards } from '@/db/schema';
import { atsBoardDiscoveries } from '@/db/schema';
import {
  extractAtsBoardTokens,
  normalizeBoardToken,
  isPlausibleBoardToken,
  type AtsPlatform,
  type ExtractedBoard,
} from './atsTokenPatterns';

export { extractAtsBoardTokens, type AtsPlatform, type ExtractedBoard };

type SeedBoard = {
  token: string;
  companyName?: string;
  source?: string;
};

export async function seedAtsBoards(boards: SeedBoard[], platform: AtsPlatform = 'greenhouse') {
  const normalized = boards
    .map((board) => ({
      platform,
      token: normalizeBoardToken(board.token),
      companyName: board.companyName?.trim() || null,
      source: board.source?.trim() || 'seed',
    }))
    .filter((board) => board.token.length > 0);

  if (normalized.length === 0) return [];

  const existing = await db
    .select({ token: atsBoards.token })
    .from(atsBoards)
    .where(
      sql`${atsBoards.platform} = ${platform} AND ${atsBoards.token} IN (${sql.join(normalized.map(b => b.token), sql`, `)})`
    );
  const existingTokens = new Set(existing.map((board) => board.token));
  const inserts = normalized.filter((board) => !existingTokens.has(board.token));

  if (inserts.length === 0) return [];

  return db.insert(atsBoards).values(inserts).returning();
}

export async function getActiveAtsBoardTokens(platform: string, limit = 100) {
  const rows = await db
    .select({ token: atsBoards.token })
    .from(atsBoards)
    .where(sql`${atsBoards.status} = 'active' AND ${atsBoards.platform} = ${platform}`)
    .orderBy(asc(atsBoards.token))
    .limit(limit);

  return rows.map((row) => row.token);
}

/**
 * Returns a batch of active board tokens, prioritized by boards that have
 * the most observed jobs. Uses offset-based pagination so the worker can
 * rotate through the registry across successive search runs.
 */
export async function getActiveAtsBoardTokensBatch(platform: string, batchSize = 200, offset = 0) {
  const rows = await db
    .select({
      token: atsBoards.token,
      jobCount: atsBoards.lastSeenJobCount,
    })
    .from(atsBoards)
    .where(sql`${atsBoards.status} = 'active' AND ${atsBoards.platform} = ${platform}`)
    .orderBy(sql`coalesce(${atsBoards.lastSeenJobCount}, 0) desc`, asc(atsBoards.token))
    .limit(batchSize)
    .offset(offset);

  return rows.map((row) => row.token);
}

export async function getActiveBoardCount(platform: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(atsBoards)
    .where(sql`${atsBoards.status} = 'active' AND ${atsBoards.platform} = ${platform}`);
  return row.count;
}

export async function validateAtsBoard(platform: string, token: string) {
  const normalizedToken = normalizeBoardToken(token);

  let url = '';
  if (platform === 'greenhouse') {
    url = `https://boards-api.greenhouse.io/v1/boards/${normalizedToken}/jobs?content=false`;
  } else if (platform === 'lever') {
    url = `https://api.lever.co/v0/postings/${normalizedToken}`;
  } else if (platform === 'ashby') {
    url = `https://api.ashbyhq.com/posting-api/job-board/${normalizedToken}?includeSecondaryLocations=true`;
  } else if (platform === 'smartrecruiters') {
    url = `https://api.smartrecruiters.com/v1/companies/${normalizedToken}/postings?limit=10`;
  } else if (platform === 'recruitee') {
    url = `https://${normalizedToken}.recruitee.com/api/offers/`;
  } else {
    throw new Error('Unsupported platform');
  }

  const response = await fetch(url, { cache: 'no-store' });
  const now = new Date();

  if (!response.ok) {
    await db.update(atsBoards).set({
      status: response.status === 404 ? 'invalid' : 'error',
      lastValidatedAt: now,
      lastError: `HTTP ${response.status}`,
      updatedAt: now,
    }).where(sql`${atsBoards.token} = ${normalizedToken} AND ${atsBoards.platform} = ${platform}`);
    return false;
  }

  let jobCount: number | null = null;
  const payload = await response.json();
  if (platform === 'greenhouse' && Array.isArray((payload as any).jobs)) {
    jobCount = (payload as any).jobs.length;
  } else if (platform === 'lever' && Array.isArray(payload)) {
    jobCount = payload.length;
  } else if (platform === 'ashby' && Array.isArray((payload as any).jobs)) {
    jobCount = (payload as any).jobs.length;
  } else if (platform === 'smartrecruiters' && Array.isArray((payload as any).content)) {
    jobCount = (payload as any).totalFound ?? (payload as any).content.length;
  } else if (platform === 'recruitee' && Array.isArray((payload as any).offers)) {
    jobCount = (payload as any).offers.length;
  }

  await db.update(atsBoards).set({
    status: 'active',
    lastValidatedAt: now,
    lastSeenJobCount: jobCount,
    lastError: null,
    updatedAt: now,
  }).where(sql`${atsBoards.token} = ${normalizedToken} AND ${atsBoards.platform} = ${platform}`);
  return true;
}

export async function refreshAtsBoardRegistry(platform: string, limit = 100) {
  const tokens = await getActiveAtsBoardTokens(platform, limit);
  const results = [];

  for (const token of tokens) {
    try {
      results.push({ token, ok: await validateAtsBoard(platform, token) });
    } catch (error: any) {
      const now = new Date();
      await db.update(atsBoards).set({
        status: 'error',
        lastValidatedAt: now,
        lastError: error?.message ?? 'Unknown validation error',
        updatedAt: now,
      }).where(sql`${atsBoards.token} = ${token} AND ${atsBoards.platform} = ${platform}`);
      results.push({ token, ok: false });
    }
  }

  return results;
}

export async function getAtsRegistryMetrics(platform?: string) {
  const whereClause = platform ? sql`WHERE ${atsBoards.platform} = ${platform}` : sql``;
  const [row] = await db
    .select({
      totalBoards: sql<number>`count(*)::int`,
      activeBoards: sql<number>`count(*) filter (where ${atsBoards.status} = 'active')::int`,
      invalidBoards: sql<number>`count(*) filter (where ${atsBoards.status} = 'invalid')::int`,
      errorBoards: sql<number>`count(*) filter (where ${atsBoards.status} = 'error')::int`,
      boardsWithJobs: sql<number>`count(*) filter (where coalesce(${atsBoards.lastSeenJobCount}, 0) > 0)::int`,
      jobsSeen: sql<number>`coalesce(sum(${atsBoards.lastSeenJobCount}), 0)::int`,
    })
    .from(atsBoards)
    .where(platform ? eq(atsBoards.platform, platform) : undefined);

  return row;
}

export async function discoveratsBoardsFromText(input: {
  text: string;
  sourceUrl?: string;
  sourceType?: string;
}) {
  const extracted = extractAtsBoardTokens(input.text);
  if (extracted.length === 0) return [];

  // Find which (platform, token) pairs already exist so we only validate new ones.
  const existing = await db
    .select({ platform: atsBoards.platform, token: atsBoards.token })
    .from(atsBoards)
    .where(inArray(atsBoards.token, extracted.map((entry) => entry.token)));
  const existingKeys = new Set(existing.map((board) => `${board.platform}:${board.token}`));

  const discoveries: Array<{ platform: AtsPlatform; token: string; ok: boolean | null }> = [];
  const pendingValidation: Array<{ platform: AtsPlatform; token: string; discoveryId: string }> = [];

  for (const { platform, token } of extracted) {
    const key = `${platform}:${token}`;
    const now = new Date();
    const [discovery] = await db.insert(atsBoardDiscoveries).values({
      platform,
      token,
      sourceUrl: input.sourceUrl,
      sourceType: input.sourceType ?? 'unknown',
      rawEvidence: input.text.slice(0, 4000),
    }).returning();

    const isNewToken = !existingKeys.has(key);
    if (isNewToken) {
      await db.insert(atsBoards).values({
        platform,
        token,
        source: input.sourceType ?? 'discovery',
        updatedAt: now,
      }).onConflictDoNothing();
      existingKeys.add(key);
      pendingValidation.push({ platform, token, discoveryId: discovery.id });
      discoveries.push({ platform, token, ok: null });
    } else {
      await db.update(atsBoardDiscoveries).set({
        validatedAt: now,
        validationStatus: 'known',
      }).where(eq(atsBoardDiscoveries.id, discovery.id));
      discoveries.push({ platform, token, ok: true });
    }
  }

  const validationResults = await mapWithConcurrency(
    pendingValidation,
    10,
    async ({ platform, token, discoveryId }) => {
      const ok = await validateAtsBoard(platform, token);
      await db.update(atsBoardDiscoveries).set({
        validatedAt: new Date(),
        validationStatus: ok ? 'valid' : 'invalid',
      }).where(eq(atsBoardDiscoveries.id, discoveryId));
      return { platform, token, ok };
    },
  );
  const validationByKey = new Map(validationResults.map((result) => [`${result.platform}:${result.token}`, result.ok]));

  for (const discovery of discoveries) {
    if (discovery.ok === null) {
      discovery.ok = validationByKey.get(`${discovery.platform}:${discovery.token}`) ?? false;
    }
  }

  return discoveries;
}

// ── Self-growing registry: turn company NAMES into permanent ATS sources ──────

const PROBE_PLATFORMS: AtsPlatform[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee'];

function companyNameToToken(name: string): string {
  return (name ?? '')
    .normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|co|s\.?a\.?(\s+de\s+cv)?|group|grupo|technologies|tech|labs|software|solutions|holdings|company|the)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function probeUrl(platform: AtsPlatform, token: string): string {
  switch (platform) {
    case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
    case 'lever': return `https://api.lever.co/v0/postings/${token}?mode=json`;
    case 'ashby': return `https://api.ashbyhq.com/posting-api/job-board/${token}`;
    case 'smartrecruiters': return `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1`;
    case 'recruitee': return `https://${token}.recruitee.com/api/offers/`;
  }
}

function probeJobCount(platform: AtsPlatform, payload: any): number {
  if (platform === 'greenhouse') return Array.isArray(payload?.jobs) ? payload.jobs.length : 0;
  if (platform === 'lever') return Array.isArray(payload) ? payload.length : 0;
  if (platform === 'ashby') return Array.isArray(payload?.jobs) ? payload.jobs.length : 0;
  if (platform === 'smartrecruiters') return payload?.totalFound ?? 0;
  if (platform === 'recruitee') return Array.isArray(payload?.offers) ? payload.offers.length : 0;
  return 0;
}

async function probeBoard(platform: AtsPlatform, token: string): Promise<boolean> {
  try {
    const r = await fetch(probeUrl(platform, token), { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status !== 200) return false;
    return probeJobCount(platform, await r.json()) > 0;
  } catch {
    return false;
  }
}

/**
 * Turns company NAMES (e.g. surfaced by LinkedIn) into permanent ATS sources:
 * derive a token, probe every platform, and seed the live ones into the registry.
 * Already-known and previously-missed tokens are skipped so each name is probed
 * at most once. This is how the registry grows automatically over time.
 */
export async function growRegistryFromCompanies(companyNames: string[]): Promise<{ probed: number; added: number }> {
  const tokens = [...new Set(companyNames.map(companyNameToToken))].filter((t) => isPlausibleBoardToken(t) && t.length >= 3);
  if (tokens.length === 0) return { probed: 0, added: 0 };

  const known = await db.select({ token: atsBoards.token }).from(atsBoards).where(inArray(atsBoards.token, tokens));
  const knownSet = new Set(known.map((k) => k.token));
  const fresh = tokens.filter((t) => !knownSet.has(t)).slice(0, 25);
  if (fresh.length === 0) return { probed: 0, added: 0 };

  let added = 0;
  await mapWithConcurrency(fresh, 6, async (token) => {
    for (const platform of PROBE_PLATFORMS) {
      if (await probeBoard(platform, token)) {
        await seedAtsBoards([{ token, source: 'linkedin-derived' }], platform);
        added += 1;
        return;
      }
    }
    // No board on any platform - record as invalid so we never re-probe it.
    await db.insert(atsBoards).values({ platform: 'greenhouse', token, source: 'probe-miss', status: 'invalid', updatedAt: new Date() }).onConflictDoNothing();
  });

  return { probed: fresh.length, added };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}
