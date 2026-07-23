import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { userSettings, applications, vacancies } from '@/db/schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import { getAtsRegistryMetrics } from '@/core/platforms/atsRegistry';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [settings] = await db.select({
    searchInProgress: userSettings.searchInProgress,
    lastSearchStatus: userSettings.lastSearchStatus,
    lastSearchResultCount: userSettings.lastSearchResultCount,
    lastSearchPreparedCount: userSettings.lastSearchPreparedCount,
    lastSearchFilteredCount: userSettings.lastSearchFilteredCount,
    lastSearchSourceCount: userSettings.lastSearchSourceCount,
    lastSearchScannedSourceCount: userSettings.lastSearchScannedSourceCount,
    lastSearchAt: userSettings.lastSearchAt,
    lastSearchError: userSettings.lastSearchError,
    lastSearchFunnel: userSettings.lastSearchFunnel,
  }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);

  if (!settings) return NextResponse.json({ error: 'No settings' }, { status: 404 });

  // The stored funnel snapshot (lastSearchFunnel) is per SEARCH RUN - it only
  // reflects that one run's results, not everything actually sitting in the
  // review queue today (accumulated across many runs). The "Resultado: listas
  // en tu Feed" cards read as the CURRENT queue, so they need a live count
  // instead of the stale per-run snapshot - found real via user feedback
  // (funnel said "2 alta confianza" while Pendientes/Feed had far more).
  let liveHighConfidence = 0;
  let liveGoodMatch = 0;
  if (settings.lastSearchFunnel) {
    const [row] = await db.select({
      high: sql<number>`count(*) filter (where ${vacancies.score} >= 70)`,
      good: sql<number>`count(*) filter (where ${vacancies.score} >= 60 and ${vacancies.score} < 70)`,
    }).from(applications)
      .innerJoin(vacancies, eq(applications.vacancyId, vacancies.id))
      .where(and(eq(applications.userId, userId), eq(applications.status, 'pending_review')));
    liveHighConfidence = Number(row?.high ?? 0);
    liveGoodMatch = Number(row?.good ?? 0);
  }

  // Same staleness problem for "universe" (vacantes en nuestra base): it was
  // a snapshot of registryMetrics.jobsSeen at the moment of the user's OWN
  // last search, so it only ever changes when THEY search - even though the
  // real registry keeps growing continuously in the background (scheduled
  // refresh_job_cache/discover_ats_boards/discover_companies_directory jobs,
  // independent of any one user). Read live instead, so this screen actually
  // reflects "the system found more since last time you looked" - found real
  // via user feedback ("ese numero esta fijo hace rato... nuestro sistema
  // debe estar buscando constantemente").
  let liveUniverse: number | undefined;
  if (settings.lastSearchFunnel) {
    const metrics = await getAtsRegistryMetrics();
    liveUniverse = metrics?.jobsSeen ?? undefined;
  }

  const funnel = settings.lastSearchFunnel
    ? {
        ...(settings.lastSearchFunnel as Record<string, unknown>),
        highConfidence: liveHighConfidence,
        goodMatch: liveGoodMatch,
        ...(liveUniverse != null ? { universe: liveUniverse } : {}),
      }
    : settings.lastSearchFunnel;

  return NextResponse.json({ ...settings, lastSearchFunnel: funnel });
}
