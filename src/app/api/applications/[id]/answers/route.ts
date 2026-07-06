import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { applications } from '@/db/schema';
import { captureReusableAnswer } from '@/core/memory/memoryStore';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const { answers } = await req.json() as { answers?: Record<string, string> };

  if (!answers || typeof answers !== 'object') {
    return NextResponse.json({ error: 'Invalid answers payload' }, { status: 400 });
  }

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Merge with existing answers so filling a few missing fields doesn't wipe the rest.
  const merged = { ...((app.formAnswers as Record<string, string>) ?? {}), ...answers };
  await db.update(applications).set({ formAnswers: merged, updatedAt: new Date() }).where(eq(applications.id, id));
  await Promise.all(Object.entries(answers).map(([question, answer]) => captureReusableAnswer(userId, question, answer)));

  return NextResponse.json({ success: true });
}
