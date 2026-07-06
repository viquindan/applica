import { eq, and, gte } from 'drizzle-orm';
import { db } from '@/db/client';
import { usageEvents } from '@/db/schema';

export async function getCurrentMonthApplicationCount(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const events = await db.select()
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.eventType, 'application_prepared'),
        gte(usageEvents.createdAt, startOfMonth)
      )
    );

  return events.length;
}

export async function trackApplicationPrepared(userId: string): Promise<void> {
  await db.insert(usageEvents).values({
    userId,
    eventType: 'application_prepared',
    metadata: { source: 'worker' },
  });
}
