import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { vacancies } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { captureApplicationDecisionLearning } from '@/core/memory/memoryStore';

/**
 * Discard a vacancy that has no application yet (e.g. a low-score "filtered"
 * result). Marks it archived so it leaves the list, and feeds the discard to the
 * learning layer so the agent stops surfacing similar roles.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const [vacancy] = await db.select().from(vacancies)
    .where(and(eq(vacancies.id, id), eq(vacancies.userId, userId))).limit(1);
  if (!vacancy) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.update(vacancies).set({ status: 'archived', updatedAt: new Date() })
    .where(eq(vacancies.id, id));

  try {
    await captureApplicationDecisionLearning(userId, 'archive', {
      title: vacancy.title,
      company: vacancy.company,
      location: vacancy.location,
      platform: vacancy.platform,
    });
  } catch {}

  return NextResponse.json({ success: true, status: 'archived' });
}
