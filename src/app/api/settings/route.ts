import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [s] = await db.select().from(userSettings).where(eq(userSettings.userId, session.user.id)).limit(1);
  return NextResponse.json(s || {});
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const {
    aiProvider: _aiProvider,
    aiApiKeyEncrypted: _aiApiKeyEncrypted,
    aiModel: _aiModel,
    ...safeBody
  } = body;
  await db.update(userSettings).set({ ...safeBody, updatedAt: new Date() }).where(eq(userSettings.userId, session.user.id));
  return NextResponse.json({ success: true });
}
