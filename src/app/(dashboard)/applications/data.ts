import { db } from '@/db/client';
import { applications, applicationSubmissions, professionalProfiles, userSettings, users, vacancies } from '@/db/schema';
import { and, count, countDistinct, eq, gte, sql } from 'drizzle-orm';
import { ensureUserMemory } from '@/core/memory/memoryStore';
import { getOutcomeMetrics } from '@/core/outcomes/outcomeMetrics';
import { getAtsRegistryMetrics } from '@/core/platforms/atsRegistry';
import { getUserPlanLimits } from '@/core/billing/planLimits';
import { getCurrentMonthApplicationCount } from '@/core/billing/usageTracker';

export type AppRow = typeof applications.$inferSelect & {
  vacancy: Pick<typeof vacancies.$inferSelect, 'title' | 'company' | 'platform' | 'url' | 'score' | 'location' | 'warnings' | 'description'> | null;
};

/**
 * Single data bundle shared by the Feed / Pendientes / Apps pages so the
 * apply-engine state (status machine, blockers) is computed identically no
 * matter which tab a user lands on. Each page slices this same `apps` array
 * client-side (see useApplicationSlices).
 */
// Shared column shape for the vacancies+applications bundle below - kept as
// a function (not a query fragment) so the two queries in loadApplicationsData
// stay in lockstep without copy-pasting the object twice.
function appRowColumns() {
  return {
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
  };
}

// Real bug found in QA (2026-07-21/22): a single `ORDER BY createdAt DESC
// LIMIT 200` on the WHOLE pool meant a big search (a real run created 333
// applications) silently pushed the OLDEST ones - which are exactly the ones
// that finish material prep FIRST - out of the window. Result: vacancies
// already sitting in `pending_review`, ready to swipe, were invisible in the
// Feed/Pendientes/Apps because the query never returned them at all. Fix:
// every currently-actionable row (pending_review/approved) is fetched with
// NO cap - that set is bounded by the score threshold and how fast the user
// swipes, not by total history size - and only the settled/historical rows
// (draft, filtered, submitted, archived, skipped...) share the 200-row cap.
const ACTIONABLE_STATUS_SQL = sql`coalesce(${applications.status}::text, ${vacancies.status}::text) in ('pending_review', 'approved')`;

export async function loadApplicationsData(userId: string) {
  await ensureUserMemory(userId);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    actionableRows,
    historyRows,
    [user],
    [profile],
    [settings],
    [totalApps],
    [todayApps],
    [pendingReview],
    [submitted],
    [appliedToday],
    outcomes,
    supplyMetrics,
    usageLimits,
    currentCount,
  ] = await Promise.all([
    db
      .select(appRowColumns())
      .from(vacancies)
      .leftJoin(applications, eq(vacancies.id, applications.vacancyId))
      .where(and(eq(vacancies.userId, userId), ACTIONABLE_STATUS_SQL))
      .orderBy(sql`coalesce(${applications.createdAt}, ${vacancies.createdAt}) desc`),
    db
      .select(appRowColumns())
      .from(vacancies)
      .leftJoin(applications, eq(vacancies.id, applications.vacancyId))
      .where(and(eq(vacancies.userId, userId), sql`not (${ACTIONABLE_STATUS_SQL})`))
      .orderBy(sql`coalesce(${applications.createdAt}, ${vacancies.createdAt}) desc`)
      .limit(200),
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select({ count: count() }).from(applications).where(eq(applications.userId, userId)),
    db.select({ count: count() }).from(applications).where(and(eq(applications.userId, userId), gte(applications.createdAt, todayStart))),
    db.select({ count: count() }).from(applications).where(and(eq(applications.userId, userId), eq(applications.status, 'pending_review'))),
    db.select({ count: count() }).from(applications).where(and(eq(applications.userId, userId), eq(applications.status, 'submitted'))),
    // "Aplicadas hoy": distinct applications this user actually swiped on
    // today, not vacancies the engine merely prepared today (that confusion
    // is exactly why the daily-goal bar read "83/10" with zero real swipes -
    // see docs/STATUS.md 2026-07-18). approvalTimestamp is set at the exact
    // swipe moment by the approve/assisted/mark_applied actions - no new
    // column needed, it already existed unused for this purpose.
    db.select({ count: countDistinct(applicationSubmissions.applicationId) })
      .from(applicationSubmissions)
      .innerJoin(applications, eq(applications.id, applicationSubmissions.applicationId))
      .where(and(eq(applications.userId, userId), gte(applicationSubmissions.approvalTimestamp, todayStart))),
    getOutcomeMetrics(userId),
    getAtsRegistryMetrics(),
    getUserPlanLimits(userId),
    getCurrentMonthApplicationCount(userId),
  ]);

  return {
    apps: [...actionableRows, ...historyRows] as unknown as AppRow[],
    user,
    profile,
    settings,
    stats: {
      total: totalApps.count,
      today: todayApps.count,
      pendingReview: pendingReview.count,
      submitted: submitted.count,
      appliedToday: appliedToday.count,
    },
    outcomes,
    supply: { activeBoards: supplyMetrics.activeBoards, jobsSeen: supplyMetrics.jobsSeen },
    billing: { tier: user?.subscriptionTier, limits: usageLimits, currentCount },
    linkedinStatus: (user?.linkedinSessionStatus as 'none' | 'connected' | 'expired') ?? 'none',
  };
}
