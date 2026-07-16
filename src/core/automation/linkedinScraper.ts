import { NormalizedVacancy } from '../scoring/fitScorer';
import { stripHtml } from '../platforms/atsSearchHelpers';
import { normalizeLinkedInUrl } from './linkedinSession';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const randomDelay = (min = 3000, max = 8000) => new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min));

/**
 * Fetches the full description for a single job from LinkedIn's public guest
 * endpoint. Gentle by design: caller throttles between calls, we keep one
 * session User-Agent, and we signal rate-limiting so the caller can back off.
 */
async function fetchJobDescription(jobId: string, sessionUA: string, referer: string): Promise<{ text: string | null; rateLimited: boolean }> {
  try {
    const res = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`, {
      headers: {
        'User-Agent': sessionUA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': referer,
      },
    });
    if (res.status === 429) return { text: null, rateLimited: true };
    if (!res.ok) return { text: null, rateLimited: false };

    const html = await res.text();
    const markup = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i)?.[1]
      || html.match(/description__text[^>]*>([\s\S]*?)<\/section>/i)?.[1];
    const text = markup ? stripHtml(markup) : null;
    return { text: text && text.length > 40 ? text : null, rateLimited: false };
  } catch {
    return { text: null, rateLimited: false };
  }
}

interface ScraperOptions {
  roles?: string[];
  locations?: string[];
}

export async function scrapeLinkedInRemoteLatAm(options?: ScraperOptions): Promise<NormalizedVacancy[]> {
  console.log('[LinkedIn Stealth Scraper] Initializing...');

  const vacancies: NormalizedVacancy[] = [];
  const targetRoles = options?.roles?.length ? options.roles : ['Software Engineer'];
  const locations = options?.locations?.length ? options.locations : ['Latin America'];
  // One consistent User-Agent for the whole run looks like a single browsing session.
  const sessionUA = getRandomUA();

  // More effort: up to 5 roles, the candidate's top 3 locations (local first),
  // and NO remote-only filter so local on-site/hybrid roles also show up.
  const searchRoles = targetRoles.slice(0, 5);
  const searchLocations = locations.slice(0, 3);
  const MAX_JOBS = 30;

  for (const role of searchRoles) {
    for (const location of searchLocations) {
      if (vacancies.length >= MAX_JOBS) break;

      const query = encodeURIComponent(role);
      const loc = encodeURIComponent(location);
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${query}&location=${loc}&start=0`;

      console.log(`[LinkedIn Stealth Scraper] Fetching guest jobs for: ${role} in ${location}...`);

      try {
        await randomDelay(); // Delay before each request

        const response = await fetch(url, {
          headers: {
            'User-Agent': getRandomUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
          }
        });

        if (!response.ok) {
          console.warn(`[LinkedIn Stealth Scraper] API returned status ${response.status} for ${role}`);
          if (response.status === 429) {
            console.warn('[LinkedIn Stealth Scraper] Rate limited. Stopping further requests.');
            return vacancies; // Stop on rate limit
          }
          continue;
        }

        const html = await response.text();

        // Parse HTML with regex since we don't have a DOM parser in the edge/node worker
        const jobCardRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        let match;

        while ((match = jobCardRegex.exec(html)) !== null && vacancies.length < MAX_JOBS) {
          const cardHtml = match[1];

          // Extract data using regex
          const titleMatch = cardHtml.match(/<h3[^>]*base-search-card__title[^>]*>([^<]+)<\/h3>/i);
          const companyMatch = cardHtml.match(/<h4[^>]*base-search-card__subtitle[^>]*>[\s]*<a[^>]*>([^<]+)<\/a>/i) ||
                               cardHtml.match(/<h4[^>]*base-search-card__subtitle[^>]*>([^<]+)<\/h4>/i);
          const locationMatch = cardHtml.match(/<span[^>]*job-search-card__location[^>]*>([^<]+)<\/span>/i);
          const linkMatch = cardHtml.match(/<a[^>]*base-card__full-link[^>]*href="([^"]+)"/i);

          if (titleMatch && companyMatch && linkMatch) {
            // LinkedIn's card HTML carries HTML entities (Church &amp;amp; Dwight) -
            // regex-extraction alone doesn't decode them, so they leaked into the
            // stored title/company/location verbatim and showed up literally in
            // the UI. stripHtml() strips no actual tags here (there are none in
            // these fields) but does decode entities.
            const title = stripHtml(titleMatch[1].trim());
            const company = stripHtml(companyMatch[1].trim());
            const jobLocation = locationMatch ? stripHtml(locationMatch[1].trim()) : location;
            let link = linkMatch[1].trim();
            // clean tracking params + normalize country subdomains (pa./mx.…)
            // to www so the logged-in session is recognized when applying.
            link = normalizeLinkedInUrl(link.split('?')[0]);

            const jobIdMatch = link.match(/-(\d+)$/);
            const externalId = jobIdMatch ? jobIdMatch[1] : `li-${Date.now()}-${vacancies.length}`;
            const modality = /\bremote\b/i.test(jobLocation) ? 'remote' : /\bhybrid\b/i.test(jobLocation) ? 'hybrid' : undefined;

            // Avoid duplicates
            if (!vacancies.find(v => v.externalId === externalId)) {
              vacancies.push({
                id: externalId,
                platform: 'linkedin',
                externalId,
                title,
                company,
                location: jobLocation,
                modality, // inferred from the card (no remote-only filter now)
                description: `Role found via LinkedIn Stealth Scraper. [Apply here](${link})`,
                url: link,
                postedAt: new Date(),
              });
            }
          }
        }
      } catch (error) {
        console.error(`[LinkedIn Stealth Scraper] Failed fetching for ${role}:`, error);
      }
    }
  }

  // ── Enrichment pass: fetch each job's real description so scoring/tailoring
  // have actual content. Gentle: sequential, randomly delayed, stop on 429.
  console.log(`[LinkedIn Stealth Scraper] Enriching ${vacancies.length} jobs with full descriptions...`);
  let enriched = 0;
  for (const vacancy of vacancies) {
    if (!/^\d{6,}$/.test(vacancy.externalId ?? '')) continue;
    await randomDelay(2500, 6000);
    const { text, rateLimited } = await fetchJobDescription(vacancy.externalId!, sessionUA, vacancy.url);
    if (rateLimited) {
      console.warn('[LinkedIn Stealth Scraper] Rate limited during enrichment. Keeping titles for the rest.');
      break;
    }
    if (text) {
      vacancy.description = text;
      vacancy.requirements = text;
      enriched += 1;
    }
  }

  console.log(`[LinkedIn Stealth Scraper] Successfully extracted ${vacancies.length} vacancies (${enriched} with full descriptions).`);
  return vacancies;
}
