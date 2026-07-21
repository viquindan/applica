import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { swipeFeedback, users, vacancies } from '@/db/schema';
import { isSearchTuningUser } from '@/lib/searchTuning';

// Motor de afinamiento (docs/SEARCH-ENGINE.md): captura por qué el usuario
// swipeó positivo/negativo en el Feed, junto al score real de la vacante en
// ese momento, para analizar y derivar reglas nuevas de scoring/eligibilidad
// en sesiones futuras. Puramente aditivo - no toca `applications`/`vacancies`.
const bodySchema = z.object({
  vacancyId: z.string().uuid(),
  applicationId: z.string().uuid().optional(),
  decision: z.enum(['positive', 'negative']),
  reason: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!isSearchTuningUser(user?.email)) {
    return NextResponse.json({ error: 'Not enabled for this account' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { vacancyId, applicationId, decision, reason } = parsed.data;

  const [vacancy] = await db.select({ score: vacancies.score, scoreBreakdown: vacancies.scoreBreakdown })
    .from(vacancies).where(and(eq(vacancies.id, vacancyId), eq(vacancies.userId, userId))).limit(1);
  if (!vacancy) return NextResponse.json({ error: 'Vacancy not found' }, { status: 404 });

  await db.insert(swipeFeedback).values({
    userId,
    vacancyId,
    applicationId: applicationId ?? null,
    decision,
    reason,
    scoreAtDecision: vacancy.score,
    scoreBreakdownAtDecision: vacancy.scoreBreakdown,
  });

  return NextResponse.json({ success: true });
}
