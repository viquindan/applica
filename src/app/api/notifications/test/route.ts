import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { sendPushToUser } from '@/core/notifications/pushSender';

// Lets the signed-in user confirm the whole push pipeline works end to end
// (permission granted -> token registered via /api/mobile/device-token ->
// Expo -> FCM -> device) without waiting for a real trigger (captcha,
// new vacancies, needs-review). Only ever pushes to the caller's own
// devices - no way to target another user from here.
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await sendPushToUser(userId, 'Notificación de prueba', 'Si ves esto, las notificaciones push funcionan.');
  return NextResponse.json({ success: true });
}
