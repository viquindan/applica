/**
 * Pre-flight liveness check for a vacancy URL, run server-side BEFORE opening
 * the assisted-apply window. ATS platforms don't 404 closed postings: Greenhouse
 * 301-redirects them to the company's own careers page (verified live with
 * 6sense: boards.greenhouse.io/... -> 6sense.com/about-us/careers/join-us/),
 * which strands the user on a page our filler can't do anything with.
 *
 * Signals treated as "gone" (conservative on purpose):
 *   - final HTTP status 404 or 410
 *   - the redirect chain ends on a DIFFERENT registrable domain than the ATS
 *     host we stored (subdomain hops like boards.greenhouse.io ->
 *     job-boards.greenhouse.io are the same domain and stay "alive")
 * Anything ambiguous (network error, timeout, 403 on the same domain, same-page
 * soft "no longer accepting" banners) counts as ALIVE: a false "gone" silently
 * skips a real opportunity, while a false "alive" just opens a window the user
 * closes.
 */

export interface UrlLivenessResult {
  gone: boolean;
  reason?: 'http_gone' | 'redirected_off_domain';
  finalUrl?: string;
  status?: number;
}

/** Naive registrable domain (last two labels). Enough for the ATS hosts we
 * store (greenhouse.io, lever.co, ashbyhq.com, smartrecruiters.com,
 * recruitee.com); do NOT reuse for arbitrary URLs with ccTLDs like .co.uk. */
function registrableDomain(hostname: string): string {
  return hostname.split('.').slice(-2).join('.');
}

export async function checkVacancyUrlGone(url: string, timeoutMs = 10_000): Promise<UrlLivenessResult> {
  let original: URL;
  try { original = new URL(url); } catch { return { gone: false }; }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    });
    const finalUrl = new URL(resp.url || url);
    if (resp.status === 404 || resp.status === 410) {
      return { gone: true, reason: 'http_gone', finalUrl: finalUrl.href, status: resp.status };
    }
    if (registrableDomain(finalUrl.hostname) !== registrableDomain(original.hostname)) {
      return { gone: true, reason: 'redirected_off_domain', finalUrl: finalUrl.href, status: resp.status };
    }
    return { gone: false, finalUrl: finalUrl.href, status: resp.status };
  } catch {
    return { gone: false }; // fail open: never block an apply on a flaky check
  } finally {
    clearTimeout(timer);
  }
}
