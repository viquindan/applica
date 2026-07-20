import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { vacancies, applications } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { queuePrepareApplicationMaterials } from '@/core/jobs/boss';
import { getReusableAnswersMap } from '@/core/memory/memoryStore';

/**
 * "Apply anyway" to a low-score / filtered vacancy the user liked on review.
 * Creates the application and queues material preparation, so it joins the normal
 * apply flow (review send) even though it was below the auto threshold.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [vacancy] = await db.select().from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.userId, userId))).limit(1);
  if (!vacancy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // If an application already exists for this vacancy, just point to it.
  const [existing] = await db.select().from(applications)
    .where(and(eq(applications.vacancyId, id), eq(applications.userId, userId))).limit(1);
  if (existing) return NextResponse.json({ success: true, applicationId: existing.id, existed: true });

  const reusableAnswers = await getReusableAnswersMap(userId);

  const [application] = await db.insert(applications).values({
    userId,
    vacancyId: id,
    status: 'draft',
    mode: 'semi',
    formAnswers: reusableAnswers,
  }).returning();

  await db.update(vacancies).set({ status: 'generating', updatedAt: new Date() }).where(eq(vacancies.id, id));
  // No quota charge here: this only PREPARES the application. The quota is
  // spent when the user actually sends it (swipe/approve) - see the action route.
  await queuePrepareApplicationMaterials(application.id);

  return NextResponse.json({ success: true, applicationId: application.id });
}
