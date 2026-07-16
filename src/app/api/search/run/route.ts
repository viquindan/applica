import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { queueImmediateSearch } from '@/core/jobs/boss';
import { db } from '@/db/client';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // queueImmediateSearch has no singletonKey (by design - "search now" must
    // always fire, unlike the scheduled queueSearch's 15min dedup), so nothing
    // upstream stops a second call from queueing a job on top of one already
    // running. Two overlapping search_vacancies jobs for the same user fight
    // over the same LinkedIn scraper/Chromium/AI-limiter resources - found
    // live during testing (two runs both stalled on the same batch that
    // completed fine alone). Reject here instead.
    const [existing] = await db.select({ searchInProgress: userSettings.searchInProgress, lastSearchStatus: userSettings.lastSearchStatus })
      .from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (existing?.searchInProgress || existing?.lastSearchStatus === 'queued' || existing?.lastSearchStatus === 'running') {
      return NextResponse.json({ success: false, error: 'Ya hay una búsqueda en curso.' }, { status: 409 });
    }

    await db.update(userSettings).set({
      searchInProgress: false,
      lastSearchStatus: 'queued',
      lastSearchError: null,
      lastSearchResultCount: 0,
      lastSearchPreparedCount: 0,
      lastSearchFilteredCount: 0,
      lastSearchSourceCount: 0,
      lastSearchScannedSourceCount: 0,
      updatedAt: new Date(),
    }).where(eq(userSettings.userId, userId));
    await queueImmediateSearch(userId);
    return NextResponse.json({ success: true, message: 'Search job queued via pg-boss' });
  } catch (error: any) {
    console.error('Error queuing search:', error);
    return NextResponse.json({ error: 'Failed to queue search job', details: error.message }, { status: 500 });
  }
}
