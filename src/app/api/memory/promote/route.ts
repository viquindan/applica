import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { promoteMemoryToSkills } from '@/core/memory/memoryStore';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await promoteMemoryToSkills(session.user.id);
  return NextResponse.json(result);
}
