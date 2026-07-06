import { auth } from'@/lib/auth';
import { db } from'@/db/client';
import { applications, vacancies, resumes, coverLetters, applicationSubmissions } from'@/db/schema';
import { eq, and } from'drizzle-orm';
import { notFound } from'next/navigation';
import ApplicationDetailClient from'./ApplicationDetailClient';

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = (session?.user as any)?.id as string;
  const { id } = await params;

  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId)))
    .limit(1);

  // Fallback: low-score"filtered" results have no application - the id is a
  // vacancy id. Render a read-only review (description, radar, why-low, discard).
  if (!app) {
    const [v] = await db.select().from(vacancies)
      .where(and(eq(vacancies.id, id), eq(vacancies.userId, userId))).limit(1);
    if (!v) notFound();
    const syntheticApp = {
      id: v.id, userId, vacancyId: v.id,
      status: (v.status as string) === 'archived' ? 'archived' : 'filtered',
      mode: 'none', formAnswers: {}, submissionDecision: null, responseStatus: 'unknown',
      createdAt: v.createdAt, updatedAt: v.updatedAt,
    } as any;
    return (
      <ApplicationDetailClient app={syntheticApp} vacancy={v} resume={null} coverLetter={null} submission={null} vacancyOnly />
    );
  }

  const [vacancy] = await db.select().from(vacancies).where(eq(vacancies.id, app.vacancyId)).limit(1);
  const resume = app.adaptedResumeId
    ? (await db.select().from(resumes).where(eq(resumes.id, app.adaptedResumeId)).limit(1))[0]
    : null;
  const coverLetter = app.coverLetterId
    ? (await db.select().from(coverLetters).where(eq(coverLetters.id, app.coverLetterId)).limit(1))[0]
    : null;
  const [submission] = await db.select().from(applicationSubmissions)
    .where(eq(applicationSubmissions.applicationId, id)).limit(1);

  return (
    <ApplicationDetailClient
      app={app}
      vacancy={vacancy}
      resume={resume ?? null}
      coverLetter={coverLetter ?? null}
      submission={submission ?? null}
    />
  );
}
