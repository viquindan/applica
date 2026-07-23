import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { userSettings, applications, vacancies } from '@/db/schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';

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

  const funnel = settings.lastSearchFunnel
    ? { ...(settings.lastSearchFunnel as Record<string, unknown>), highConfidence: liveHighConfidence, goodMatch: liveGoodMatch }
    : settings.lastSearchFunnel;

  return NextResponse.json({ ...settings, lastSearchFunnel: funnel });
}
