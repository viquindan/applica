import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { professionalProfiles, userSettings, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ensureUserMemory, refreshCoreMemory } from '@/core/memory/memoryStore';
import { queueSearch } from '@/core/jobs/boss';

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();

  await Promise.all([
    db.update(userSettings).set({
      maxVacancyAgeDays: body.maxVacancyAgeDays ? Number(body.maxVacancyAgeDays) : 14,
      searchCadenceHours: body.searchCadenceHours ? Number(body.searchCadenceHours) : 24,
      updatedAt: new Date(),
    }).where(eq(userSettings.userId, userId)),
  ]);
  await ensureUserMemory(userId);
  await refreshCoreMemory(userId);
  const nextSearchAt = new Date(Date.now() + (body.searchCadenceHours ? Number(body.searchCadenceHours) : 24) * 60 * 60 * 1000);
  await db.update(userSettings).set({ nextSearchAt }).where(eq(userSettings.userId, userId));
  try {
    await queueSearch(userId, nextSearchAt);
  } catch (error) {
    console.error('[home] failed to queue next search; preferences were still saved:', error);
  }

  return NextResponse.json({ success: true });
}
