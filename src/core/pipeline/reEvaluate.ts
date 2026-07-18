import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { vacancies, applications, professionalProfiles, users, userSettings } from '@/db/schema';
import { scoreVacancy, type NormalizedVacancy } from '../scoring/fitScorer';
import { evaluateEligibility, formRequiresForeignWorkAuth } from '../scoring/eligibility';
import { getReusableAnswersMap } from '../memory/memoryStore';
import { queuePrepareApplicationMaterials } from '../jobs/boss';
import { trackApplicationPrepared } from '../billing/usageTracker';

/**
 * Re-evaluate a user's stored vacancies against the CURRENT eligibility + scoring
 * rules. Hides ones that are no longer applicable and re-scores the rest, so rule
 * changes apply to history automatically (instead of only to new searches).
 *
 * A vacancy scored below the generation threshold at search time (status
 * 'filtered') never got a second look before - if a later profile fix or
 * scoring change would now push it over the threshold, it stayed stranded
 * at 'filtered' forever, invisible to the user, since nothing but the
 * original processVacancy.ts creation path ever created an application row.
 * This promotes it the same way processVacancy.ts does on first sight.
 */
export async function reEvaluateVacancies(userId: string): Promise<{ checked: number; hidden: number; rescored: number; promoted: number }> {
  const [[user], [profile], [settings]] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
  ]);
  if (!user || !profile) return { checked: 0, hidden: 0, rescored: 0, promoted: 0 };
  const genThreshold = settings?.minScoreToGenerateMaterials ?? 60;

  const homeCountry = user.country || user.location;
  const scoringProfile = {
    ...profile,
    homeCountry,
    salaryMin: user.salaryMin,
    salaryMax: user.salaryMax,
    workModality: user.workModality,
    workModalityPrefs: user.workModalityPrefs,
    languages: user.languages,
  } as any;

  const rows = await db.select({
    id: vacancies.id, title: vacancies.title, company: vacancies.company, location: vacancies.location,
    modality: vacancies.modality, description: vacancies.description, requirements: vacancies.requirements,
    url: vacancies.url, platform: vacancies.platform, score: vacancies.score, status: vacancies.status,
    salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax,
    applicationId: applications.id,
    submissionDecision: applications.submissionDecision,
  })
    .from(vacancies)
    .leftJoin(applications, eq(applications.vacancyId, vacancies.id))
    .where(and(eq(vacancies.userId, userId), ne(vacancies.status, 'archived')));

  let hidden = 0, rescored = 0, promoted = 0;
  const reusableAnswers = await getReusableAnswersMap(userId);
  for (const r of rows) {
    // Never touch manual test fixtures (kept at a fixed marker score).
    if (r.title?.startsWith('[TEST]')) continue;
    const nv: NormalizedVacancy = {
      id: r.id, platform: r.platform, title: r.title, company: r.company,
      location: r.location ?? undefined, modality: r.modality ?? undefined,
      description: r.description ?? '', requirements: r.requirements ?? undefined,
      url: r.url, salaryMin: r.salaryMin ?? undefined, salaryMax: r.salaryMax ?? undefined,
    };

    const elig = evaluateEligibility(nv, {
      homeCountry, targetCountries: profile.targetCountries, languages: user.languages,
      relocationAvailable: user.relocationAvailable, workAuthorization: user.workAuthorization,
    });
    if (!elig.eligible) {
      await db.update(vacancies).set({ status: 'archived', updatedAt: new Date() }).where(eq(vacancies.id, r.id));
      hidden++;
      continue;
    }

    const fp = (r.submissionDecision as any)?.formPreview;
    const formAuth = formRequiresForeignWorkAuth(
      [...(fp?.blockers ?? []), ...((fp?.fields ?? []).map((f: any) => f.label))],
      homeCountry,
    );
    let finalScore = scoreVacancy(nv, scoringProfile).score;
    if (formAuth) finalScore = Math.min(finalScore, 40);
    if (finalScore !== r.score) {
      await db.update(vacancies).set({ score: finalScore, updatedAt: new Date() }).where(eq(vacancies.id, r.id));
      rescored++;
    }

    // Promote: a vacancy that never got an application (still 'filtered')
    // now clears the generation threshold - create it exactly like a fresh
    // search would, instead of leaving a genuinely good match stranded.
    if (!r.applicationId && r.status === 'filtered' && finalScore >= genThreshold) {
      const [application] = await db.insert(applications).values({
        userId, vacancyId: r.id, status: 'draft', mode: 'semi', formAnswers: reusableAnswers,
      }).returning();
      await db.update(vacancies).set({ status: 'generating', updatedAt: new Date() }).where(eq(vacancies.id, r.id));
      await trackApplicationPrepared(userId);
      await queuePrepareApplicationMaterials(application.id);
      promoted++;
    }
  }
  return { checked: rows.length, hidden, rescored, promoted };
}
