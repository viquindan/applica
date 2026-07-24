import { PlatformAdapter, SearchFilters } from './PlatformAdapter';
import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';
import { inferModality } from '../scoring/geography';
import { filterRankLimit, mapWithConcurrency, stripHtml } from './atsSearchHelpers';

/**
 * BambooHR public API adapter (search/discovery only - see note below).
 *
 * Verified live 2026-07-24 against real accounts before writing this (no
 * endpoint here is guessed):
 * - List: https://{token}.bamboohr.com/careers/list
 *   -> { meta: {totalCount}, result: [{ id, jobOpeningName, departmentLabel,
 *      employmentStatusLabel, location: {city, state}, isRemote,
 *      locationType }] } - NO description in the list response.
 * - Detail: https://{token}.bamboohr.com/careers/{id}/detail
 *   -> { result: { jobOpening: { description (HTML), jobOpeningShareUrl,
 *      location: {city, state, addressCountry}, ... } } }
 *
 * Same intentional scope as workable.ts: search-only, NOT registered in
 * worker.ts's `adapters` map, so any BambooHR vacancy falls through to
 * GenericAdapter for the assisted apply flow (APPLY-ENGINE.md) instead of
 * this file touching the apply engine at all.
 */
export class BambooHrAdapter implements PlatformAdapter {
  name = 'bamboohr';

  async search(filters: SearchFilters): Promise<NormalizedVacancy[]> {
    const boardTokens = filters.boardTokens ?? [];
    if (boardTokens.length === 0) return [];

    let scannedSources = 0;
    const allJobs = await mapWithConcurrency(boardTokens, 15, async (token) => {
      scannedSources += 1;
      if (filters.onProgress && (scannedSources % 100 === 0 || scannedSources === boardTokens.length)) {
        await filters.onProgress({ scannedSources, totalSources: boardTokens.length });
      }
      try {
        const res = await fetch(`https://${token}.bamboohr.com/careers/list`);
        if (!res.ok) return [];
        const data = await res.json();
        const jobs = Array.isArray(data?.result) ? data.result : [];
        if (jobs.length === 0) return [];
        return await mapWithConcurrency(jobs, 5, (job) => this.normalizeJob(job, token));
      } catch (error) {
        console.warn(`[BambooHR] Failed to fetch account ${token}:`, (error as Error)?.message ?? error);
        return [];
      }
    });

    return filterRankLimit(allJobs.flat(), filters);
  }

  async extractVacancy(url: string): Promise<NormalizedVacancy | null> {
    const match = url.match(/([a-z0-9_-]+)\.bamboohr\.com\/careers\/(\d+)/i);
    if (!match) return null;
    const [, token, id] = match;
    const res = await fetch(`https://${token}.bamboohr.com/careers/${id}/detail`);
    if (!res.ok) return null;
    const data = await res.json();
    const job = data?.result?.jobOpening;
    return job ? this.normalizeFromDetail(job, token, id) : null;
  }

  async apply(): Promise<Partial<ApplicationSubmission>> {
    throw new Error('[BambooHR] Automated apply is not implemented - handled via GenericAdapter (assisted flow).');
  }

  private async normalizeJob(job: any, token: string): Promise<NormalizedVacancy> {
    let description = '';
    let country: string | undefined;
    try {
      const res = await fetch(`https://${token}.bamboohr.com/careers/${job.id}/detail`);
      if (res.ok) {
        const data = await res.json();
        const detail = data?.result?.jobOpening;
        description = stripHtml(detail?.description ?? '');
        country = detail?.atsLocation?.country ?? undefined;
      }
    } catch (error) {
      console.warn(`[BambooHR] Failed to fetch description for ${token}/${job.id}:`, (error as Error)?.message ?? error);
    }

    const location = [job.location?.city, job.location?.state, country].filter(Boolean).join(', ') || undefined;
    const modality = job.isRemote || String(job.locationType) === '1' ? 'remote' : inferModality(location ?? '');

    return {
      id: String(job.id),
      platform: this.name,
      externalId: String(job.id),
      title: job.jobOpeningName,
      company: token,
      location,
      modality,
      description: description || stripHtml(job.departmentLabel ?? ''),
      url: `https://${token}.bamboohr.com/careers/${job.id}`,
    };
  }

  private normalizeFromDetail(job: any, token: string, id: string): NormalizedVacancy {
    const location = [job.location?.city, job.location?.state, job.atsLocation?.country].filter(Boolean).join(', ') || undefined;
    return {
      id,
      platform: this.name,
      externalId: id,
      title: job.jobOpeningName,
      company: token,
      location,
      modality: inferModality(location ?? ''),
      description: stripHtml(job.description ?? ''),
      url: job.jobOpeningShareUrl || `https://${token}.bamboohr.com/careers/${id}`,
    };
  }
}
