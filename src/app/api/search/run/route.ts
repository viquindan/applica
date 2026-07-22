import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { queueImmediateSearch } from '@/core/jobs/boss';

export async function POST(req: Request) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // The "already in progress" guard lives in queueImmediateSearch itself
    // now (shared by every caller, not just this route) - see its comment in
    // src/core/jobs/boss.ts for why that centralization matters.
    const { queued } = await queueImmediateSearch(userId);
    if (!queued) {
      return NextResponse.json({ success: false, error: 'Ya hay una búsqueda en curso.' }, { status: 409 });
    }
    return NextResponse.json({ success: true, message: 'Search job queued via pg-boss' });
  } catch (error: any) {
    console.error('Error queuing search:', error);
    return NextResponse.json({ error: 'Failed to queue search job', details: error.message }, { status: 500 });
  }
}
