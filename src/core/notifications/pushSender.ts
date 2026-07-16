import { db } from '@/db/client';
import { deviceTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Fire-and-forget Expo push notification to every device the user has
 * registered (see POST /api/mobile/device-token). Expo's push service is a
 * single HTTP endpoint shared by iOS/Android - no separate FCM/APNs wiring
 * needed on our side. Never throws: a failed push must not fail the job that
 * triggered it.
 */
export async function sendPushToUser(userId: string, title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  try {
    const tokens = await db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
    if (!tokens.length) return;

    const messages = tokens.map((t) => ({
      to: t.expoPushToken,
      title,
      body,
      data: data ?? {},
      sound: 'default' as const,
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (e) {
    console.warn('[pushSender] Failed to send push:', (e as Error)?.message ?? e);
  }
}
