import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queueImmediateSearch } from '@/core/jobs/boss';
import { db } from '@/db/client';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const userId = (session.user as any).id as string;
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
