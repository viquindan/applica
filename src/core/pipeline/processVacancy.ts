import { and, eq, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { applications, professionalProfiles, userSettings, users, vacancies } from '@/db/schema';
import { scoreVacancy, type NormalizedVacancy } from '../scoring/fitScorer';
import { evaluateEligibility } from '../scoring/eligibility';
import { getLearnedScoringSignals } from '../scoring/learnedSignals';
import { buildProfileText } from '../scoring/expertise';
import { maybeSemanticAdjust } from '../scoring/semanticMatch';
import { getReusableAnswersMap } from '../memory/memoryStore';
import { queuePrepareApplicationMaterials } from '../jobs/boss';
import { getUserPlanLimits } from '../billing/planLimits';
import { getCurrentMonthApplicationCount, trackApplicationPrepared } from '../billing/usageTracker';

/** Guards against garbage salary parses overflowing the integer column. */
function sanitizeSalary(value?: number | null): number | null {
  if (value == null || !Number.isFinite(value) || value < 0 || value > 50_000_000) return null;
  return Math.round(value);
}

export async function processVacancyForUser(userId: string, vacancy: NormalizedVacancy, context?: {
  user: any; profile: any; settings: any; planLimits: any; currentCount: number;
}) {
  const planLimits = context?.planLimits ?? await getUserPlanLimits(userId);
  const currentCount = context?.currentCount ?? await getCurrentMonthApplicationCount(userId);

  if (vacancy.platform === 'linkedin' && !planLimits.canUseLinkedInScraper) {
    return { skipped: true, reason: 'linkedin_pro_only' };
  }

  if (currentCount >= planLimits.maxMonthlyApplications) {
    return { skipped: true, reason: 'limit_reached' };
  }
  const [userRows, profileRows, settingsRows, vacancyRows] = await Promise.all([
    context?.user ? Promise.resolve([context.user]) : db.select().from(users).where(eq(users.id, userId)).limit(1),
    context?.profile ? Promise.resolve([context.profile]) : db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    context?.settings ? Promise.resolve([context.settings]) : db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select().from(vacancies)
      .where(and(
        eq(vacancies.userId, userId),
        or(
          eq(vacancies.url, vacancy.url),
          and(eq(vacancies.platform, vacancy.platform), eq(vacancies.externalId, vacancy.externalId ?? '')),
        ),
      ))
      .limit(1),
  ]);
  // IMPORTANT: each query returns an array - unwrap the row, otherwise the
  // scorer receives an array-wrapped profile and every field is undefined
  // (roleMatch 0, no home country, etc.) every vacancy collapses to ~35.
  const user = userRows[0];
  const profile = profileRows[0];
  const settings = settingsRows[0];
  const existingVacancy = vacancyRows[0];

  if (!user || !profile || !settings) throw new Error(`Missing user setup for ${userId}`);
  if (existingVacancy) return { vacancyId: existingVacancy.id, created: false, applicationId: null };

  // HARD eligibility gate: hide fundamentally-inapplicable roles entirely
  // (foreign onsite, required language you don't speak, far-market leadership).
  // These are never stored, so they don't even appear in the discarded list.
  const eligibility = evaluateEligibility(vacancy, {
    homeCountry: user.country || user.location,
    targetCountries: profile.targetCountries,
    // BUG FIX: languages lives on `users`, not `professionalProfiles` - this
    // read `profile.languages` (always undefined) so the foreign-language
    // hard-exclude (R2) never recognized any language the user actually
    // declared, silently over-filtering roles requiring a language they have.
    languages: user.languages,
    relocationAvailable: user.relocationAvailable,
    workAuthorization: user.workAuthorization,
  });
  if (!eligibility.eligible) {
    return { skipped: true, reason: 'ineligible', reasons: eligibility.reasons } as any;
  }

  const learnedSignals = await getLearnedScoringSignals(userId, vacancy);
  const score = scoreVacancy(vacancy, {
    ...profile,
    homeCountry: user.country || user.location,
    salaryMin: user.salaryMin,
    salaryMax: user.salaryMax,
    workModality: user.workModality,
    workModalityPrefs: user.workModalityPrefs,
    languages: user.languages,
  }, learnedSignals);

  const genThreshold = settings.minScoreToGenerateMaterials ?? 60;

  // Optional semantic re-ranking for borderline candidates (no-op unless enabled).
  const semantic = await maybeSemanticAdjust({
    userId,
    profileText: buildProfileText(profile),
    jobText: `${vacancy.title}\n${vacancy.description ?? ''}\n${vacancy.requirements ?? ''}`,
    baseScore: score.score,
    threshold: genThreshold,
  });
  let finalScore = Math.max(0, Math.min(100, score.score + semantic.adjustment));
  // Don't let semantic re-ranking lift a locally-capped vacancy back over 50.
  // The stable marker phrase is shared by every cap warning in fitScorer.ts
  // (the old check looked for 'EE. UU.', a wording no cap warning uses anymore).
  if (score.warnings.some((w) => w.includes('desde tu país no es elegible'))) finalScore = Math.min(finalScore, 50);
  const finalBreakdown = {
    ...score.breakdown,
    semanticAdjustment: semantic.adjustment,
    semanticSimilarity: semantic.similarity,
    total: finalScore,
  };

  const [storedVacancy] = await db.insert(vacancies).values({
    userId,
    platform: vacancy.platform,
    externalId: vacancy.externalId,
    title: vacancy.title,
    company: vacancy.company,
    location: vacancy.location,
    modality: vacancy.modality as any,
    salaryMin: sanitizeSalary(vacancy.salaryMin),
    salaryMax: sanitizeSalary(vacancy.salaryMax),
    salaryCurrency: vacancy.salaryCurrency,
    description: vacancy.description,
    requirements: vacancy.requirements,
    url: vacancy.url,
    postedAt: vacancy.postedAt,
    normalizedData: vacancy,
    score: finalScore,
    scoreBreakdown: finalBreakdown,
    redFlags: score.redFlags,
    warnings: score.warnings,
    status: finalScore >= genThreshold ? 'generating' : 'filtered',
  }).returning();

  if (finalScore < genThreshold) {
    return { vacancyId: storedVacancy.id, created: true, applicationId: null };
  }

  const reusableAnswers = await getReusableAnswersMap(userId);
  const [application] = await db.insert(applications).values({
    userId,
    vacancyId: storedVacancy.id,
    status: 'draft',
    mode: 'semi',
    formAnswers: reusableAnswers,
  }).returning();

  await trackApplicationPrepared(userId);

  await queuePrepareApplicationMaterials(application.id);
  return { vacancyId: storedVacancy.id, created: true, applicationId: application.id };
}
