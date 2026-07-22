'use client';
import { useEffect, useState } from 'react';

// "Ayudar ahora (en vivo)" - live noVNC viewer for an assisted-apply session
// stuck on a captcha (docs/APPLY-ENGINE.md §4/§5 + live-session plan,
// 2026-07-22). Polls its own live-session endpoint (not the shared apps
// query) since this needs to reflect a fast-changing, per-application signal
// with its own short window (15 min), independent of the normal apps refetch
// cadence.
export default function LiveSessionButton({ applicationId }: { applicationId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch(`/api/applications/${applicationId}/live-session`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUrl(data.live ? data.url : null);
      } catch {
        /* transient - next poll retries */
      }
    }
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [applicationId]);

  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="btn btn-gold btn-sm"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem' }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--danger, #c0392b)', boxShadow: '0 0 6px var(--danger, #c0392b)' }} />
      Ayudar ahora (en vivo)
    </a>
  );
}
