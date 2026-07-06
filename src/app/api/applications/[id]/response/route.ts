import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { applications, vacancies } from '@/db/schema';
import { captureMarketResponseLearning } from '@/core/memory/memoryStore';
import { refreshOutcomeSummaryMemory } from '@/core/memory/memoryStore';
import { getOutcomeMetrics } from '@/core/outcomes/outcomeMetrics';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const { response } = await req.json() as { response?: 'contacted' | 'rejected' | 'unknown' };

  if (!['contacted', 'rejected', 'unknown'].includes(response ?? '')) {
    return NextResponse.json({ error: 'Invalid response' }, { status: 400 });
  }

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [vacancy] = await db.select({
    title: vacancies.title,
    company: vacancies.company,
    location: vacancies.location,
    platform: vacancies.platform,
  }).from(vacancies).where(eq(vacancies.id, app.vacancyId)).limit(1);

  await db.update(applications).set({
    responseStatus: response,
    contactedAt: response === 'contacted' ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(applications.id, id));

  if (response === 'contacted' || response === 'rejected') {
    await captureMarketResponseLearning(userId, response, vacancy ?? {});
  }
  await refreshOutcomeSummaryMemory(userId, await getOutcomeMetrics(userId));

  return NextResponse.json({ success: true, response });
}
