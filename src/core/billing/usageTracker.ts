import { eq, and, gte } from 'drizzle-orm';
import { db } from '@/db/client';
import { usageEvents } from '@/db/schema';

// The monthly quota is spent when the USER SENDS an application (a swipe /
// approve / assisted / mark-applied), NOT when the engine automatically
// prepares materials in the background. The prior design charged at
// preparation time, so a free user could exhaust their whole month without
// ever applying to anything - the engine quietly prepared 30 in the
// background and locked them out (confirmed in production: a user with 0
// active applications was blocked at 83/30). This aligns billing with D13
// (the swipe is the only send authorization): you only pay for applications
// you actually chose to send.
export async function getCurrentMonthApplicationCount(userId: string): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const events = await db.select()
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        eq(usageEvents.eventType, 'application_sent'),
        gte(usageEvents.createdAt, startOfMonth)
      )
    );

  return events.length;
}

/** Record a real user-authorized send (swipe/approve/assisted/mark-applied). */
export async function trackApplicationSent(userId: string): Promise<void> {
  await db.insert(usageEvents).values({
    userId,
    eventType: 'application_sent',
    metadata: { source: 'user_action' },
  });
}
