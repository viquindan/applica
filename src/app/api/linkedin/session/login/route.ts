import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { captureLinkedInCookiesSilently } from '@/core/automation/browserCookies';
import { setLinkedInSession } from '@/core/automation/linkedinSession';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;

  // 1) OPPORTUNISTIC silent read: if the session happens to be readable (browser
  // not holding a lock), grab it with no window at all. Never forces the user
  // to close anything - if it can't, we just fall through to a login.
  const silent = captureLinkedInCookiesSilently();
  if (silent.ok && silent.cookies?.length) {
    await setLinkedInSession(userId, silent.cookies);
    return NextResponse.json({ ok: true, via: `silent:${silent.browser}` });
  }

  // 2) One-time login: open LinkedIn in the user's OWN browser (Brave/Chrome/Edge)
  // and capture once they sign in. Like connecting any account - no closing or
  // switching browsers. The session then persists (refreshed on each use).
  // Dynamic require: linkedinLoginCapture.ts imports `playwright` directly,
  // which breaks Next's build-time page-data collection if imported
  // statically (same fix as the other LinkedIn automation routes).
  const { captureLinkedInLogin } = require('@/core/automation/linkedinLoginCapture');
  const result = await captureLinkedInLogin(userId);
  return NextResponse.json({ ...result, via: 'assisted' });
}
