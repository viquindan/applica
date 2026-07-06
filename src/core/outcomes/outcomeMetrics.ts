import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { applications, vacancies } from '@/db/schema';
import { roleLearningKey, roleLearningLabel } from './roleLearning';

export async function getOutcomeMetrics(userId: string) {
  const rows = await db.select({
    responseStatus: applications.responseStatus,
    title: vacancies.title,
  })
    .from(applications)
    .leftJoin(vacancies, eq(applications.vacancyId, vacancies.id))
    .where(eq(applications.userId, userId));

  const contacted = rows.filter((row) => row.responseStatus === 'contacted').length;
  const rejected = rows.filter((row) => row.responseStatus === 'rejected').length;
  const resolved = contacted + rejected;
  const contactRate = resolved ? Math.round((contacted / resolved) * 100) : 0;

  const byRole = new Map<string, { contacted: number; rejected: number }>();
  for (const row of rows) {
    if (!['contacted', 'rejected'].includes(row.responseStatus)) continue;
    const key = roleLearningKey(row.title);
    const current = byRole.get(key) ?? { contacted: 0, rejected: 0 };
    if (row.responseStatus === 'contacted') current.contacted += 1;
    if (row.responseStatus === 'rejected') current.rejected += 1;
    byRole.set(key, current);
  }

  const rolePerformance = [...byRole.entries()]
    .map(([role, value]) => ({
      role,
      label: roleLearningLabel(role),
      contacted: value.contacted,
      rejected: value.rejected,
      total: value.contacted + value.rejected,
      contactRate: Math.round((value.contacted / (value.contacted + value.rejected)) * 100),
    }))
    .sort((a, b) => b.total - a.total || b.contactRate - a.contactRate)
    .slice(0, 5);

  return { contacted, rejected, resolved, contactRate, rolePerformance };
}
