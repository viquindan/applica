import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
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
  }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);

  if (!settings) return NextResponse.json({ error: 'No settings' }, { status: 404 });

  return NextResponse.json(settings);
}
