import { auth } from'@/lib/auth';
import { db } from'@/db/client';
import { applications, professionalProfiles, userSettings, users, vacancies } from'@/db/schema';
import { and, count, eq, gte, sql } from'drizzle-orm';
import ApplicationsClient from'./ApplicationsClient';
import { ensureUserMemory } from'@/core/memory/memoryStore';
import { getOutcomeMetrics } from'@/core/outcomes/outcomeMetrics';
import { getAtsRegistryMetrics } from'@/core/platforms/atsRegistry';
import { getUserPlanLimits } from'@/core/billing/planLimits';
import { getCurrentMonthApplicationCount } from'@/core/billing/usageTracker';

export const metadata = { title: 'Búsqueda y Aplicaciones' };

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  await ensureUserMemory(userId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    rows,
    [user],
    [profile],
    [settings],
    [totalApps],
    [todayApps],
    [pendingReview],
    [submitted],
    outcomes,
    supplyMetrics,
    usageLimits,
    currentCount,
  ] = await Promise.all([
    db
      .select({
        id: sql`coalesce(${applications.id}::text, ${vacancies.id}::text)`.mapWith(String),
        userId: vacancies.userId,
        vacancyId: vacancies.id,
        status: sql`coalesce(${applications.status}::text, ${vacancies.status}::text)`.mapWith(String),
        mode: sql`coalesce(${applications.mode}::text, 'none'::text)`.mapWith(String),
        adaptedResumeId: applications.adaptedResumeId,
        coverLetterId: applications.coverLetterId,
        formAnswers: applications.formAnswers,
        resumeChanges: applications.resumeChanges,
        submissionDecision: applications.submissionDecision,
        responseStatus: sql`coalesce(${applications.responseStatus}::text, 'unknown'::text)`.mapWith(String),
        contactedAt: applications.contactedAt,
        createdAt: sql`coalesce(${applications.createdAt}, ${vacancies.createdAt})`,
        updatedAt: sql`coalesce(${applications.updatedAt}, ${vacancies.updatedAt})`,
        vacancy: {
          title: vacancies.title,
          company: vacancies.company,
          platform: vacancies.platform,
          url: vacancies.url,
          score: vacancies.score,
          location: vacancies.location,
          warnings: vacancies.warnings,
          description: vacancies.description,
        },
      })
      .from(vacancies)
      .leftJoin(applications, eq(vacancies.id, applications.vacancyId))
      .where(eq(vacancies.userId, userId))
      .orderBy(sql`coalesce(${applications.createdAt}, ${vacancies.createdAt}) desc`)
      .limit(200),
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select({ count: count() }).from(applications).where(eq(applications.userId, userId)),
    db.select({ count: count() }).from(applications).where(and(eq(applications.userId, userId), gte(applications.createdAt, todayStart))),
    db.select({ count: count() }).from(applications).where(and(eq(applications.userId, userId), eq(applications.status, 'pending_review'))),
    db.select({ count: count() }).from(applications).where(and(eq(applications.userId, userId), eq(applications.status, 'submitted'))),
    getOutcomeMetrics(userId),
    getAtsRegistryMetrics(),
    getUserPlanLimits(userId),
    getCurrentMonthApplicationCount(userId),
  ]);

  const params = await searchParams;

  return (
    <ApplicationsClient
      apps={rows as any}
      user={user}
      profile={profile}
      settings={settings}
      stats={{
        total: totalApps.count,
        today: todayApps.count,
        pendingReview: pendingReview.count,
        submitted: submitted.count,
      }}
      outcomes={outcomes}
      supply={{ activeBoards: supplyMetrics.activeBoards, jobsSeen: supplyMetrics.jobsSeen }}
      billing={{ tier: user?.subscriptionTier, limits: usageLimits, currentCount: currentCount }}
      linkedinStatus={(user?.linkedinSessionStatus as'none' | 'connected' | 'expired') ?? 'none'}
      initialFilter={params.filter === 'attention' ? 'pending_review' : 'all'}
    />
  );
}
