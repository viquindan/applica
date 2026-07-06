import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { platformSettings } from '@/db/schema';
import { eq, and } from 'drizzle-orm';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  await db.update(platformSettings)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(platformSettings.id, id), eq(platformSettings.userId, session.user.id)));
  return NextResponse.json({ success: true });
}
