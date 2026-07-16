import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/** POST - verify the stored LinkedIn session still works (loads the feed). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Dynamic require: linkedinSessionValidate.ts -> browserManager.ts runs
  // `chromium.use(stealth())` at module top-level, which breaks Next's
  // build-time page-data collection if imported statically (same fix as
  // worker.ts / extension/resume/route.ts / linkedin/apply/test/route.ts).
  const { validateLinkedInSession } = require('@/core/automation/linkedinSessionValidate');
  const result = await validateLinkedInSession((session.user as any).id);
  return NextResponse.json(result);
}
