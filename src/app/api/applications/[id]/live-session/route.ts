import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { applications } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { signLiveSessionToken } from '@/lib/liveSessionToken';

// Matches the default `timeoutMs` in src/core/automation/assistedApply.ts -
// the worker itself clears assistedSessionStartedAt/PoolIndex as soon as that
// loop exits, but this is a defensive upper bound in case a stale row is ever
// read between an update and its clear.
const ASSISTED_SESSION_MAX_MS = 15 * 60 * 1000;

// Mints a short-lived, single-purpose URL to watch/help a live assisted-apply
// session over noVNC (docs/APPLY-ENGINE.md §4/§5 + live-session plan,
// 2026-07-22). Only returns one when there's a REAL session running for THIS
// application right now - never a stale or borrowed one.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const [app] = await db.select({
    assistedSessionStartedAt: applications.assistedSessionStartedAt,
    assistedSessionPoolIndex: applications.assistedSessionPoolIndex,
  }).from(applications).where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const live = app.assistedSessionStartedAt && app.assistedSessionPoolIndex != null
    && Date.now() - new Date(app.assistedSessionStartedAt).getTime() < ASSISTED_SESSION_MAX_MS;
  if (!live) return NextResponse.json({ live: false });

  const index = app.assistedSessionPoolIndex!;
  const token = signLiveSessionToken(id, index);
  // noVNC's static client lives at /novnc/vnc.html (served directly by nginx -
  // it's the same JS/HTML for every session, nothing per-user in it); `path`
  // tells it which WebSocket to open for the actual VNC stream. nginx gates
  // that second path with `auth_request` against the token before proxying to
  // this specific session's websockify port (see the live-session plan).
  const wsPath = `assisted-view/${index}/websockify?token=${token}`;
  const url = `/novnc/vnc.html?autoconnect=true&resize=scale&path=${encodeURIComponent(wsPath)}`;
  return NextResponse.json({ live: true, url });
}
