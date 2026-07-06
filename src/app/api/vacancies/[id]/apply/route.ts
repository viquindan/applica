import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { vacancies, applications, userSettings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { queuePrepareApplicationMaterials } from '@/core/jobs/boss';
import { getReusableAnswersMap } from '@/core/memory/memoryStore';
import { trackApplicationPrepared } from '@/core/billing/usageTracker';

/**
 * "Apply anyway" to a low-score / filtered vacancy the user liked on review.
 * Creates the application and queues material preparation, so it joins the normal
 * apply flow (review send) even though it was below the auto threshold.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const [vacancy] = await db.select().from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.userId, userId))).limit(1);
  if (!vacancy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // If an application already exists for this vacancy, just point to it.
  const [existing] = await db.select().from(applications)
    .where(and(eq(applications.vacancyId, id), eq(applications.userId, userId))).limit(1);
  if (existing) return NextResponse.json({ success: true, applicationId: existing.id, existed: true });

  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const reusableAnswers = await getReusableAnswersMap(userId);

  const [application] = await db.insert(applications).values({
    userId,
    vacancyId: id,
    status: 'draft',
    mode: settings?.globalAutomationMode === 'full' ? 'auto' : 'semi',
    formAnswers: reusableAnswers,
  }).returning();

  await db.update(vacancies).set({ status: 'generating', updatedAt: new Date() }).where(eq(vacancies.id, id));
  await trackApplicationPrepared(userId);
  await queuePrepareApplicationMaterials(application.id);

  return NextResponse.json({ success: true, applicationId: application.id });
}
