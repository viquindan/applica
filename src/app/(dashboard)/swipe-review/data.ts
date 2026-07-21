import { db } from '@/db/client';
import { swipeFeedback, vacancies } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';

export type SwipeFeedbackRow = {
  id: string;
  decision: string;
  reason: string;
  scoreAtDecision: number | null;
  scoreBreakdownAtDecision: unknown;
  createdAt: Date;
  vacancy: {
    title: string;
    company: string;
    url: string;
    location: string | null;
  } | null;
};

// Motor de afinamiento (docs/SEARCH-ENGINE.md): lista las explicaciones que
// el usuario dejó al swipear en el Feed mobile, más recientes primero, para
// revisarlas y convertirlas en reglas de scoring/eligibilidad.
export async function loadSwipeFeedback(userId: string): Promise<SwipeFeedbackRow[]> {
  const rows = await db.select({
    id: swipeFeedback.id,
    decision: swipeFeedback.decision,
    reason: swipeFeedback.reason,
    scoreAtDecision: swipeFeedback.scoreAtDecision,
    scoreBreakdownAtDecision: swipeFeedback.scoreBreakdownAtDecision,
    createdAt: swipeFeedback.createdAt,
    vacancy: {
      title: vacancies.title,
      company: vacancies.company,
      url: vacancies.url,
      location: vacancies.location,
    },
  }).from(swipeFeedback)
    .leftJoin(vacancies, eq(swipeFeedback.vacancyId, vacancies.id))
    .where(eq(swipeFeedback.userId, userId))
    .orderBy(desc(swipeFeedback.createdAt));

  return rows;
}
