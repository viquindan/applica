import { PlatformAdapter, SearchFilters } from './PlatformAdapter';
import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';
import { inferModality } from '../scoring/geography';
import { filterRankLimit, mapWithConcurrency, stripHtml } from './atsSearchHelpers';

/**
 * Workable public API adapter (search/discovery only - see note below).
 *
 * Verified live 2026-07-24 against real accounts before writing this (no
 * endpoint here is guessed):
 * - List: https://apply.workable.com/api/v1/widget/accounts/{token}
 *   -> { name, description, jobs: [{ title, shortcode, department,
 *      telecommuting, locations[], published_on, ... }] } - NO job
 *      description in the list response.
 * - Detail: https://apply.workable.com/{token}/jobs/view/{shortcode}.md
 *   -> clean Markdown of the full posting (found via the job page's own
 *      <link rel="alternate" type="text/markdown"> tag - an intentionally
 *      published machine-readable version, not scraped HTML).
 *
 * Search-only by design: `apply()`/`applyPlaywright` are intentionally NOT
 * implemented and this adapter is intentionally NOT registered in worker.ts's
 * `adapters` map (that map governs process_application/assisted_apply
 * routing - see APPLY-ENGINE.md). Leaving it unregistered there means any
 * Workable vacancy naturally falls through to GenericAdapter for the assisted
 * flow, exactly like any other unknown platform - this file only widens the
 * SEARCH pool, it never touches the apply engine.
 */
export class WorkableAdapter implements PlatformAdapter {
  name = 'workable';

  async search(filters: SearchFilters): Promise<NormalizedVacancy[]> {
    const boardTokens = filters.boardTokens ?? [];
    if (boardTokens.length === 0) return [];

    let scannedSources = 0;
    // Lower concurrency than the other cached adapters (was 15/5): found live
    // 2026-07-24 that apply.workable.com's Cloudflare front started serving
    // an HTML challenge page instead of JSON after a burst of rapid test
    // requests from one IP - handled gracefully either way (the try/catch
    // below degrades to [] and logs a warning, never crashes the search),
    // but staying gentler here avoids tripping it in the first place.
    const allJobs = await mapWithConcurrency(boardTokens, 6, async (token) => {
      scannedSources += 1;
      if (filters.onProgress && (scannedSources % 100 === 0 || scannedSources === boardTokens.length)) {
        await filters.onProgress({ scannedSources, totalSources: boardTokens.length });
      }
      try {
        const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${token}`);
        if (!res.ok) return [];
        const data = await res.json();
        const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
        if (jobs.length === 0) return [];
        // Description is a SEPARATE per-job fetch (the list endpoint doesn't
        // include it) - bounded concurrency since a single account can list
        // many roles.
        return await mapWithConcurrency(jobs, 3, (job) => this.normalizeJob(job, token));
      } catch (error) {
        console.warn(`[Workable] Failed to fetch account ${token}:`, (error as Error)?.message ?? error);
        return [];
      }
    });

    return filterRankLimit(allJobs.flat(), filters);
  }

  async extractVacancy(url: string): Promise<NormalizedVacancy | null> {
    const match = url.match(/apply\.workable\.com\/([a-z0-9_-]+)\/j\/([a-z0-9]+)/i);
    if (!match) return null;
    const [, token, shortcode] = match;
    const res = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${token}`);
    if (!res.ok) return null;
    const data = await res.json();
    const job = (data?.jobs ?? []).find((j: any) => j.shortcode === shortcode);
    return job ? this.normalizeJob(job, token) : null;
  }

  async apply(): Promise<Partial<ApplicationSubmission>> {
    throw new Error('[Workable] Automated apply is not implemented - handled via GenericAdapter (assisted flow).');
  }

  private async normalizeJob(job: any, token: string): Promise<NormalizedVacancy> {
    const location = (job.locations ?? [])
      .map((l: any) => [l.city, l.region, l.country].filter(Boolean).join(', '))
      .filter(Boolean)
      .join(' | ') || undefined;
    const modality = job.telecommuting ? 'remote' : inferModality(location ?? '');

    let description = '';
    try {
      const res = await fetch(`https://apply.workable.com/${token}/jobs/view/${job.shortcode}.md`);
      if (res.ok) description = (await res.text()).trim();
    } catch (error) {
      console.warn(`[Workable] Failed to fetch description for ${token}/${job.shortcode}:`, (error as Error)?.message ?? error);
    }

    return {
      id: job.shortcode,
      platform: this.name,
      externalId: job.shortcode,
      title: job.title,
      company: token,
      location,
      modality,
      description: description || stripHtml(job.department ?? ''),
      url: job.application_url || job.shortlink || `https://apply.workable.com/${token}/j/${job.shortcode}`,
      postedAt: job.published_on ? new Date(job.published_on) : job.created_at ? new Date(job.created_at) : undefined,
    };
  }
}
