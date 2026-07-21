import { db } from '@/db/client';
import { deviceTokens } from '@/db/schema';
import { eq } from 'drizzle-orm';

type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message?: string; details?: { error?: string } };
type ExpoReceipt = { status: 'ok' } | { status: 'error'; message?: string; details?: { error?: string } };

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

async function removeDeadToken(tokenId: string) {
  await db.delete(deviceTokens).where(eq(deviceTokens.id, tokenId));
}

async function checkReceipts(ticketIds: Array<{ id: string; tokenId: string }>) {
  if (!ticketIds.length) return;
  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: ticketIds.map((ticket) => ticket.id) }),
    });
    if (!response.ok) throw new Error(`Expo receipts returned HTTP ${response.status}`);
    const payload = await response.json() as { data?: Record<string, ExpoReceipt> };
    for (const ticket of ticketIds) {
      const receipt = payload.data?.[ticket.id];
      if (receipt?.status === 'error') {
        if (receipt.details?.error === 'DeviceNotRegistered') await removeDeadToken(ticket.tokenId);
        console.warn(`[pushSender] Expo receipt failed (${receipt.details?.error ?? 'unknown'}): ${receipt.message ?? 'no message'}`);
      }
    }
  } catch (error) {
    console.warn('[pushSender] Failed to check Expo receipts:', (error as Error)?.message ?? error);
  }
}

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

    const response = await fetch(EXPO_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`Expo push returned HTTP ${response.status}`);

    const payload = await response.json() as { data?: ExpoTicket[] };
    const receiptTickets: Array<{ id: string; tokenId: string }> = [];
    for (const [index, ticket] of (payload.data ?? []).entries()) {
      const token = tokens[index];
      if (!token) continue;
      if (ticket.status === 'ok') receiptTickets.push({ id: ticket.id, tokenId: token.id });
      else {
        if (ticket.details?.error === 'DeviceNotRegistered') await removeDeadToken(token.id);
        console.warn(`[pushSender] Expo ticket failed (${ticket.details?.error ?? 'unknown'}): ${ticket.message ?? 'no message'}`);
      }
    }

    // Expo receipts are not available immediately. Check them shortly after
    // the accepted ticket without delaying the job that triggered the push.
    const timer = setTimeout(() => void checkReceipts(receiptTickets), 15_000);
    timer.unref?.();
  } catch (e) {
    console.warn('[pushSender] Failed to send push:', (e as Error)?.message ?? e);
  }
}
