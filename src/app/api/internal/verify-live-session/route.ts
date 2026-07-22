import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { applications } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyLiveSessionToken } from '@/lib/liveSessionToken';

const ASSISTED_SESSION_MAX_MS = 15 * 60 * 1000;

// Called ONLY by nginx's `auth_request` for /assisted-view/<index>/... (never
// hit directly by a client) - the real access-control gate for the noVNC
// stream, since VNC itself has no concept of "this is your session, not
// someone else's". Body doesn't matter to nginx, only the status code:
// 2xx lets the proxy_pass to websockify through, anything else is rejected.
//
// Re-checks the token's claims against LIVE DB state instead of trusting the
// token alone - the pool slot it names could have been released and hop to a
// DIFFERENT application's session in between minting the token and it being
// used (a real race given the token's own 5-minute TTL and how transient a
// session is), which would otherwise let an old token peek at someone else's
// captcha.
export async function GET(req: NextRequest) {
  // nginx sends the token via the X-Original-URI header (set from
  // $request_uri, which - unlike $arg_token - nginx reliably resolves inside
  // an auth_request subrequest) instead of a query param on this route's own
  // URL. Fall back to our own query string for direct/manual testing.
  const originalUri = req.headers.get('x-original-uri');
  const token = originalUri
    ? new URL(originalUri, 'http://internal').searchParams.get('token')
    : req.nextUrl.searchParams.get('token');
  const claim = verifyLiveSessionToken(token);
  if (!claim) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const [app] = await db.select({
    assistedSessionStartedAt: applications.assistedSessionStartedAt,
    assistedSessionPoolIndex: applications.assistedSessionPoolIndex,
  }).from(applications).where(eq(applications.id, claim.applicationId)).limit(1);

  const stillLive = app
    && app.assistedSessionPoolIndex === claim.poolIndex
    && app.assistedSessionStartedAt
    && Date.now() - new Date(app.assistedSessionStartedAt).getTime() < ASSISTED_SESSION_MAX_MS;

  if (!stillLive) return NextResponse.json({ error: 'Session no longer live' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
