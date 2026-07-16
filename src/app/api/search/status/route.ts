import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

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
  }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);

  if (!settings) return NextResponse.json({ error: 'No settings' }, { status: 404 });

  return NextResponse.json(settings);
}
