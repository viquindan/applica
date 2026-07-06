import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const userId = session.user.id;
    await db.update(userSettings).set({
      searchInProgress: false,
      lastSearchStatus: 'cancelled',
      updatedAt: new Date(),
    }).where(eq(userSettings.userId, userId));

    return NextResponse.json({ success: true, message: 'Search cancelled' });
  } catch (error: any) {
    console.error('Error cancelling search:', error);
    return NextResponse.json({ error: 'Failed to cancel search' }, { status: 500 });
  }
}
