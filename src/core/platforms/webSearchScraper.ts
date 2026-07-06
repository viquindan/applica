/**
 * Pure web-search scraping for ATS board discovery (no database imports).
 *
 * The discovery patterns regex over raw search-result HTML, so we just need to
 * gather as much result HTML as possible. We hit two engines (DuckDuckGo + Bing)
 * across several result pages, throttled to stay under their rate limits.
 */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
];

const randomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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
function recoverUrls(engine: Engine, html: string): string {
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

async function fetchSearchHtml(engine: Engine, query: string, page: number): Promise<string> {
  const url = buildEngineUrl(engine, query, page);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    // Anything other than 200 (e.g. DuckDuckGo's 202 challenge) is a bot-block /
    // interstitial, not real results - skip it rather than parse junk.
    if (response.status !== 200) {
      console.warn(`[WebSearch] ${engine} p${page} non-200 (${response.status}) for: ${query}`);
      return '';
    }
    return recoverUrls(engine, await response.text());
  } catch (error) {
    console.warn(`[WebSearch] ${engine} p${page} failed for "${query}":`, (error as Error)?.message ?? error);
    return '';
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
  const engines = options.enginesPerQuery ?? (['duckduckgo', 'bing'] as Engine[]);
  const pages = Math.max(1, options.pagesPerQuery ?? 2);
  const delayMs = options.delayMs ?? 1200;

  const chunks: string[] = [];
  for (const query of queries) {
    for (const engine of engines) {
      for (let page = 0; page < pages; page += 1) {
        const html = await fetchSearchHtml(engine, query, page);
        if (html) chunks.push(html);
        await sleep(delayMs);
      }
    }
  }
  return chunks.join('\n');
}
