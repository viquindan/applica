import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await db.update(users).set({ onboardingCompleted: true, onboardingStep: 4, updatedAt: new Date() }).where(eq(users.id, session.user.id));
  return NextResponse.json({ success: true });
}
