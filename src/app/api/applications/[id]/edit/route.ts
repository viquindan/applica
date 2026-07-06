import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { applicationEdits, applications, coverLetters, resumes, vacancies } from '@/db/schema';
import { captureMaterialEditLearning } from '@/core/memory/memoryStore';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { id } = await params;
  const { kind, content } = await req.json();

  if (!['cv', 'letter'].includes(kind) || typeof content !== 'string' || !content.trim()) {
    return NextResponse.json({ error: 'Invalid edit payload' }, { status: 400 });
  }

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [vacancy] = await db.select().from(vacancies).where(eq(vacancies.id, app.vacancyId)).limit(1);

  if (kind === 'cv') {
    if (!app.adaptedResumeId) return NextResponse.json({ error: 'No adapted CV to edit' }, { status: 400 });
    const [resume] = await db.select().from(resumes).where(eq(resumes.id, app.adaptedResumeId)).limit(1);
    if (!resume?.textContent) return NextResponse.json({ error: 'CV unavailable' }, { status: 400 });
    await db.update(resumes).set({ textContent: content }).where(eq(resumes.id, resume.id));
    await db.insert(applicationEdits).values({
      applicationId: app.id,
      userId,
      kind: 'cv',
      originalContent: resume.textContent,
      editedContent: content,
    });
    await captureMaterialEditLearning(userId, 'cv', resume.textContent, content, vacancy?.title, vacancy?.company);
  }

  if (kind === 'letter') {
    if (!app.coverLetterId) return NextResponse.json({ error: 'No cover letter to edit' }, { status: 400 });
    const [letter] = await db.select().from(coverLetters).where(eq(coverLetters.id, app.coverLetterId)).limit(1);
    if (!letter?.content) return NextResponse.json({ error: 'Cover letter unavailable' }, { status: 400 });
    await db.update(coverLetters).set({ content }).where(eq(coverLetters.id, letter.id));
    await db.insert(applicationEdits).values({
      applicationId: app.id,
      userId,
      kind: 'letter',
      originalContent: letter.content,
      editedContent: content,
    });
    await captureMaterialEditLearning(userId, 'letter', letter.content, content, vacancy?.title, vacancy?.company);
  }

  return NextResponse.json({ success: true });
}
