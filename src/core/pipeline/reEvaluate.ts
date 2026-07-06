import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db/client';
import { vacancies, applications, professionalProfiles, users } from '@/db/schema';
import { scoreVacancy, type NormalizedVacancy } from '../scoring/fitScorer';
import { evaluateEligibility, formRequiresForeignWorkAuth } from '../scoring/eligibility';

/**
 * Re-evaluate a user's stored vacancies against the CURRENT eligibility + scoring
 * rules. Hides ones that are no longer applicable and re-scores the rest, so rule
 * changes apply to history automatically (instead of only to new searches).
 */
export async function reEvaluateVacancies(userId: string): Promise<{ checked: number; hidden: number; rescored: number }> {
  const [[user], [profile]] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
  ]);
  if (!user || !profile) return { checked: 0, hidden: 0, rescored: 0 };

  const homeCountry = user.country || user.location;
  const scoringProfile = {
    ...profile,
    homeCountry,
    salaryMin: user.salaryMin,
    salaryMax: user.salaryMax,
    workModality: user.workModality,
    workModalityPrefs: user.workModalityPrefs,
  } as any;

  const rows = await db.select({
    id: vacancies.id, title: vacancies.title, company: vacancies.company, location: vacancies.location,
    modality: vacancies.modality, description: vacancies.description, requirements: vacancies.requirements,
    url: vacancies.url, platform: vacancies.platform, score: vacancies.score,
    salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax,
    submissionDecision: applications.submissionDecision,
  })
    .from(vacancies)
    .leftJoin(applications, eq(applications.vacancyId, vacancies.id))
    .where(and(eq(vacancies.userId, userId), ne(vacancies.status, 'archived')));

  let hidden = 0, rescored = 0;
  for (const r of rows) {
    // Never touch manual test fixtures (kept at a fixed marker score).
    if (r.title?.startsWith('[TEST]')) continue;
    const nv: NormalizedVacancy = {
      id: r.id, platform: r.platform, title: r.title, company: r.company,
      location: r.location ?? undefined, modality: r.modality ?? undefined,
      description: r.description ?? '', requirements: r.requirements ?? undefined,
      url: r.url, salaryMin: r.salaryMin ?? undefined, salaryMax: r.salaryMax ?? undefined,
    };

    const elig = evaluateEligibility(nv, { homeCountry, targetCountries: profile.targetCountries, languages: user.languages });
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
  }
  return { checked: rows.length, hidden, rescored };
}
