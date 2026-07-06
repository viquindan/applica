import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { applications, vacancies, resumes, coverLetters, applicationSubmissions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;
  const { id } = await params;

  const [app] = await db.select().from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [vacancy] = await db.select().from(vacancies).where(eq(vacancies.id, app.vacancyId)).limit(1);
  const [resume] = app.adaptedResumeId ? await db.select().from(resumes).where(eq(resumes.id, app.adaptedResumeId)).limit(1) : [null];
  const [coverLetter] = app.coverLetterId ? await db.select().from(coverLetters).where(eq(coverLetters.id, app.coverLetterId)).limit(1) : [null];
  const [submission] = await db.select().from(applicationSubmissions).where(eq(applicationSubmissions.applicationId, id)).limit(1);

  const md = [
    `# Application: ${vacancy?.title ?? 'Unknown Role'} at ${vacancy?.company ?? 'Unknown Company'}`,
    `**Status:** ${app.status}`,
    `**Platform:** ${vacancy?.platform ?? 'Manual'}`,
    `**URL:** ${vacancy?.url ?? 'None'}`,
    `**Score:** ${vacancy?.score ?? 'N/A'}`,
    `**Date:** ${app.createdAt.toISOString()}`,
    ``,
    `## Submission Details`,
    `- Mode: ${app.mode}`,
    `- Submitted Automatically: ${submission?.submittedAutomatically ? 'Yes' : 'No'}`,
    `- Approved by User: ${submission?.approvedByUser ? 'Yes' : 'No'}`,
    `- Timestamp: ${submission?.submissionTimestamp?.toISOString() || 'N/A'}`,
    ``,
    `## Vacancy Description`,
    `${vacancy?.description ?? 'N/A'}`,
    ``,
    `## Adapted Resume`,
    `${resume?.textContent ?? 'N/A'}`,
    ``,
    `## Cover Letter`,
    `${coverLetter?.content ?? 'N/A'}`,
    ``,
    `## Form Answers`,
    '```json',
    JSON.stringify(app.formAnswers || {}, null, 2),
    '```',
    ``,
    `## Decision Engine Log`,
    '```json',
    JSON.stringify(app.submissionDecision || {}, null, 2),
    '```'
  ].join('\n');

  return new NextResponse(md, {
    headers: {
      'Content-Type': 'text/markdown',
      'Content-Disposition': `attachment; filename="applica_${vacancy?.company?.toLowerCase().replace(/\s+/g, '_')}_${app.id.slice(0, 8)}.md"`,
    },
  });
}
