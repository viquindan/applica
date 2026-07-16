import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { deviceTokens } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

const schema = z.object({
  expoPushToken: z.string().min(10),
  platform: z.enum(['ios', 'android']).optional(),
});

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { expoPushToken, platform } = parsed.data;

  const [existing] = await db.select().from(deviceTokens)
    .where(and(eq(deviceTokens.userId, userId), eq(deviceTokens.expoPushToken, expoPushToken))).limit(1);

  if (existing) {
    await db.update(deviceTokens).set({ lastSeenAt: new Date(), platform }).where(eq(deviceTokens.id, existing.id));
  } else {
    await db.insert(deviceTokens).values({ userId, expoPushToken, platform });
  }

  return NextResponse.json({ success: true });
}
