import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  return NextResponse.json(s || {});
}

export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const {
    aiProvider: _aiProvider,
    aiApiKeyEncrypted: _aiApiKeyEncrypted,
    aiModel: _aiModel,
    ...safeBody
  } = body;
  await db.update(userSettings).set({ ...safeBody, updatedAt: new Date() }).where(eq(userSettings.userId, userId));
  return NextResponse.json({ success: true });
}
