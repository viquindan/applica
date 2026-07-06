import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { validateLinkedInSession } from '@/core/automation/linkedinSessionValidate';

/** POST - verify the stored LinkedIn session still works (loads the feed). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const result = await validateLinkedInSession((session.user as any).id);
  return NextResponse.json(result);
}
