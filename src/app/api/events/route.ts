import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { applications, userSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const POLL_MS = 1500;
const HEARTBEAT_MS = 20000;

// Server-Sent Events for the web dashboard (2026-07-22) - one poll loop per
// connected browser tab, server-side, instead of the client-side timers it
// replaces (useApplicationActions' 4s router.refresh() while an assisted
// session is sending, useSearchEngine's 2s /api/search/status poll). Only
// pushes a frame when the fingerprint actually changes, so an idle tab with
// nothing new sends nothing but heartbeats.
//
// Deliberately NOT wired to worker.ts's individual status-transition call
// sites (9+ scattered across apply-engine code, see docs/APPLY-ENGINE.md) -
// polling application/search state from here instead needed zero changes to
// that code, at the cost of up to POLL_MS latency instead of instant push.
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const encoder = new TextEncoder();
  let closed = false;
  let lastAppsFingerprint = '';
  let lastSearchFingerprint = '';
  let lastHeartbeat = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const tick = async () => {
        if (closed) return;
        try {
          const rows = await db.select({
            id: applications.id,
            status: applications.status,
            updatedAt: applications.updatedAt,
          }).from(applications).where(eq(applications.userId, userId));
          const appsFingerprint = rows.map((r) => `${r.id}:${r.status}:${r.updatedAt?.getTime()}`).sort().join(',');
          if (appsFingerprint !== lastAppsFingerprint) {
            lastAppsFingerprint = appsFingerprint;
            send('applications_changed', { count: rows.length });
          }

          const [s] = await db.select({
            searchInProgress: userSettings.searchInProgress,
            lastSearchStatus: userSettings.lastSearchStatus,
            lastSearchResultCount: userSettings.lastSearchResultCount,
            lastSearchPreparedCount: userSettings.lastSearchPreparedCount,
            lastSearchFilteredCount: userSettings.lastSearchFilteredCount,
            lastSearchSourceCount: userSettings.lastSearchSourceCount,
            lastSearchScannedSourceCount: userSettings.lastSearchScannedSourceCount,
            lastSearchAt: userSettings.lastSearchAt,
            lastSearchError: userSettings.lastSearchError,
          }).from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
          if (s) {
            const searchFingerprint = JSON.stringify(s);
            if (searchFingerprint !== lastSearchFingerprint) {
              lastSearchFingerprint = searchFingerprint;
              send('search_progress', s);
            }
          }

          if (Date.now() - lastHeartbeat > HEARTBEAT_MS) {
            lastHeartbeat = Date.now();
            controller.enqueue(encoder.encode(': ping\n\n'));
          }
        } catch (err) {
          console.error('[events] poll error', err);
        }
      };

      await tick();
      const interval = setInterval(tick, POLL_MS);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Tells nginx not to buffer this response (it proxies via location /
      // straight to Next.js) - without this, frames sit in nginx's buffer
      // instead of streaming to the client as they're written.
      'X-Accel-Buffering': 'no',
    },
  });
}
