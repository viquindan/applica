import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { applications, vacancies } from '@/db/schema';
import type { LearnedScoringSignals, NormalizedVacancy } from './fitScorer';
import { roleLearningKey } from '../outcomes/roleLearning';

export type HistoryRow = {
  status: string | null;
  responseStatus: string;
  title: string | null;
  company: string | null;
};

/**
 * Loads the user's full application history ONCE. Audit finding 2026-07-23
 * (N1): getLearnedScoringSignals used to be called per-candidate inside the
 * search loop, re-running this same unindexed full-history JOIN for every
 * vacancy in the pool - the single heaviest DB consumer of the whole search,
 * and pure waste since the history cannot change mid-run. Callers that
 * iterate many vacancies (search_vacancies, reEvaluate) load this once and
 * feed deriveSignals() directly.
 */
export async function getUserApplicationHistory(userId: string): Promise<HistoryRow[]> {
  return db.select({
    status: applications.status,
    responseStatus: applications.responseStatus,
    title: vacancies.title,
    company: vacancies.company,
  })
    .from(applications)
    .leftJoin(vacancies, eq(applications.vacancyId, vacancies.id))
    .where(eq(applications.userId, userId));
}

export async function getLearnedScoringSignals(userId: string, vacancy: NormalizedVacancy): Promise<LearnedScoringSignals> {
  return deriveSignals(vacancy, await getUserApplicationHistory(userId));
}

export function deriveSignals(vacancy: NormalizedVacancy, history: HistoryRow[]): LearnedScoringSignals {
  const learningKey = roleLearningKey(vacancy.title);
  const roleFamily = history.filter((item) => roleLearningKey(item.title) === learningKey);
  const resolvedRoleFamily = roleFamily.filter((item) => ['contacted', 'rejected'].includes(item.responseStatus));
  const contacted = resolvedRoleFamily.filter((item) => item.responseStatus === 'contacted').length;
  const rejected = resolvedRoleFamily.filter((item) => item.responseStatus === 'rejected').length;
  const companyRejects = history.filter((item) =>
    item.company?.toLowerCase() === vacancy.company.toLowerCase() &&
    ['skipped', 'archived'].includes(item.status ?? ''),
  ).length;
  const roleRejects = roleFamily.filter((item) => ['skipped', 'archived'].includes(item.status ?? '')).length;

  let outcomeAdjustment = 0;
  let preferenceAdjustment = 0;
  const warnings: string[] = [];
  const redFlags: string[] = [];

  if (resolvedRoleFamily.length >= 3) {
    const contactRate = contacted / resolvedRoleFamily.length;
    if (contacted >= 2 && contactRate >= 0.5) {
      outcomeAdjustment += 15;
      warnings.push(`Roles parecidos han generado contacto antes (${contacted}/${resolvedRoleFamily.length}).`);
    } else if (rejected >= 2 && contactRate <= 0.2) {
      outcomeAdjustment -= 15;
      warnings.push(`Roles parecidos han tenido baja respuesta histórica (${contacted}/${resolvedRoleFamily.length}).`);
    }
  }

  if (companyRejects >= 2) {
    preferenceAdjustment -= 15;
    redFlags.push('Has rechazado repetidamente vacantes de esta empresa.');
  }

  if (roleRejects >= 3) {
    preferenceAdjustment -= 10;
    warnings.push('Has rechazado varias vacantes de rol similar.');
  }

  return { outcomeAdjustment, preferenceAdjustment, warnings, redFlags };
}
