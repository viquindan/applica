/**
 * Web-search scraping for ATS board discovery, via a real headless browser
 * (not database-free anymore in the strict sense, but still has no DB import -
 * it only pulls in the shared Playwright browser).
 *
 * Real root cause found 2026-07-23 (verified live from the VPS): DuckDuckGo
 * (both html.duckduckgo.com and duckduckgo.com) is network-blackholed from
 * this VPS's IP - plain `curl` doesn't even get a bot-challenge response, it
 * times out at the TCP level (confirmed with `curl -m 10`, both endpoints
 * hang the full 10s with no response at all). A real browser can't fix a
 * connection that never completes, so DuckDuckGo is dropped entirely rather
 * than kept as a permanently-failing no-op. Bing DOES respond (curl gets a
 * fast 200), but a bare fetch() never saw real result links - confirmed via a
 * raw HTML dump that Bing's results (`id="b_results"` > `li.b_algo`) ARE
 * present after rendering, but the `u=a1<base64>` redirector regex never
 * matched because every `&` inside the href is HTML-entity-encoded as
 * `&amp;` (`&amp;u=a1...`, not `&u=a1...`) - see the `&amp;` decode in
 * recoverUrls below, which was the actual, silent, zero-yield bug (present
 * whether the HTML came from fetch() or a real browser). Switched to a real
 * headless browser anyway, since a bare fetch() is trivially fingerprinted
 * and blocked outright by search engines going forward, and the shared
 * stealth-patched Chromium (browserManager.ts) the apply-engine already runs
 * was sitting right there for this.
 */
import { createIncognitoContext } from '../automation/browserManager';
import type { BrowserContext } from 'playwright';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Engine = 'duckduckgo' | 'bing';

function buildEngineUrl(engine: Engine, query: string, page: number): string {
  const q = encodeURIComponent(query);
  if (engine === 'bing') {
    return `https://www.bing.com/search?q=${q}&first=${page * 10 + 1}`;
  }
  // DuckDuckGo HTML, `s` is the result offset for pagination.
  return `https://html.duckduckgo.com/html/?q=${q}&s=${page * 30}`;
}

/**
 * Search engines wrap result links in redirectors, so the real target URLs are
 * encoded. Recover them: DuckDuckGo uses `uddg=<percent-encoded>`, Bing uses
 * `u=a1<base64url>`. We also keep raw hrefs and the raw HTML as a fallback.
 */
function recoverUrls(engine: Engine, rawHtml: string): string {
  // Real bug found live 2026-07-23: real Bing result links ARE present in the
  // rendered DOM (confirmed via a raw dump), but every `&` inside an href
  // attribute is HTML-entity-encoded as `&amp;` - the redirector regexes
  // below look for a literal `&` right before `u=a1`, which never matches
  // `&amp;u=a1`. This silently zeroed out extraction regardless of whether
  // fetch() or a real browser fetched the page - decode entities first.
  const html = rawHtml.replace(/&amp;/g, '&');
  const urls: string[] = [];

  if (engine === 'duckduckgo') {
    for (const m of html.matchAll(/uddg=([^&"']+)/g)) {
      try { urls.push(decodeURIComponent(m[1])); } catch { /* ignore */ }
    }
  } else {
    // Bing ck/a redirector: u=a1<base64url-of-target>
    for (const m of html.matchAll(/[?&]u=a1([A-Za-z0-9_-]+)/g)) {
      try {
        const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf8');
        if (/^https?:\/\//.test(decoded)) urls.push(decoded);
      } catch { /* ignore */ }
    }
  }

  // Plain hrefs (both engines sometimes link directly).
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) urls.push(m[1]);

  // Raw HTML last, so visible (non-encoded) ATS URLs in snippets are caught too.
  return urls.join('\n') + '\n' + html;
}

async function fetchSearchHtml(context: BrowserContext, engine: Engine, query: string, page: number): Promise<string> {
  const url = buildEngineUrl(engine, query, page);
  const tab = await context.newPage();
  try {
    await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Bing sometimes keeps navigating/redirecting client-side right after
    // domcontentloaded (found real, 2026-07-23: page.content() threw "page is
    // navigating and changing the content" on a straight timed wait) - settle
    // on 'load' first so content() isn't racing an in-flight navigation, then
    // give any late JS-injected results a moment to render.
    await tab.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    await tab.waitForTimeout(1200);
    const html = await tab.content();
    return recoverUrls(engine, html);
  } catch (error) {
    console.warn(`[WebSearch] ${engine} p${page} failed for "${query}":`, (error as Error)?.message ?? error);
    return '';
  } finally {
    await tab.close().catch(() => {});
  }
}

export interface CollectOptions {
  enginesPerQuery?: Engine[];
  pagesPerQuery?: number;
  delayMs?: number;
}

/**
 * Runs every query against the chosen engines/pages and returns all result HTML
 * concatenated. Token extraction runs over this blob downstream.
 */
export async function collectDiscoveryHtml(queries: string[], options: CollectOptions = {}): Promise<string> {
  // DuckDuckGo dropped from the default: network-blackholed from this VPS's
  // IP at the TCP level (see file header) - not a bot-challenge a browser can
  // get past, every request just times out. Still selectable explicitly via
  // enginesPerQuery for re-testing if that ever changes (different IP, etc.).
  const engines = options.enginesPerQuery ?? (['bing'] as Engine[]);
  const pages = Math.max(1, options.pagesPerQuery ?? 2);
  const delayMs = options.delayMs ?? 1200;

  // One incognito context (fresh cookies/UA, no leftover session) shared
  // across every query in this run, closed at the end - reuses the existing
  // shared headless Chromium instance (browserManager.ts) rather than
  // launching a new browser process per call.
  let context = await createIncognitoContext();
  try {
    const chunks: string[] = [];
    for (const query of queries) {
      for (const engine of engines) {
        for (let page = 0; page < pages; page += 1) {
          let html: string;
          try {
            html = await fetchSearchHtml(context, engine, query, page);
          } catch (error) {
            // Found real, 2026-07-23: a Bing navigation once took the whole
            // context down mid-run ("Target page, context or browser has
            // been closed" on the next newPage()) - recreate it once and
            // keep going instead of losing the rest of this run's queries.
            console.warn(`[WebSearch] context died, recreating (${engine} p${page}):`, (error as Error)?.message ?? error);
            await context.close().catch(() => {});
            context = await createIncognitoContext();
            html = '';
          }
          if (html) chunks.push(html);
          await sleep(delayMs);
        }
      }
    }
    return chunks.join('\n');
  } finally {
    await context.close().catch(() => {});
  }
}
