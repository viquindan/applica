import { PlatformAdapter, SearchFilters } from './PlatformAdapter';
import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';
import { inferModality } from '../scoring/geography';
import { filterRankLimit, mapWithConcurrency, stripHtml } from './atsSearchHelpers';

/**
 * Recruitee public API adapter (discovery only for now).
 * Offers: https://{token}.recruitee.com/api/offers/
 * The list response already includes description + requirements, so no detail
 * fetch is needed.
 */
export class RecruiteeAdapter implements PlatformAdapter {
  name = 'recruitee';

  async search(filters: SearchFilters): Promise<NormalizedVacancy[]> {
    const boardTokens = filters.boardTokens ?? [];
    if (boardTokens.length === 0) return [];

    let scannedSources = 0;
    const allJobs = await mapWithConcurrency(boardTokens, 20, async (token) => {
      const res = await fetch(`https://${token}.recruitee.com/api/offers/`);
      scannedSources += 1;
      if (filters.onProgress && (scannedSources % 100 === 0 || scannedSources === boardTokens.length)) {
        await filters.onProgress({ scannedSources, totalSources: boardTokens.length });
      }
      if (!res.ok) {
        console.warn(`[Recruitee] Failed to fetch company ${token}: ${res.status}`);
        return [];
      }
      const data = await res.json();
      return (Array.isArray(data.offers) ? data.offers : []).map((job: any) => this.normalizeJob(job, token));
    });

    return filterRankLimit(allJobs.flat(), filters);
  }

  async extractVacancy(url: string): Promise<NormalizedVacancy | null> {
    const match = url.match(/(?:https?:\/\/)?([^.]+)\.recruitee\.com\/o\/([^/?]+)/i)
      || url.match(/careers[^/]*\/o\/([^/?]+)/i);
    if (!match) return null;
    // Recruitee careers URLs may use a custom domain; fall back to scanning the
    // company's offers when we can resolve the subdomain.
    const token = match.length === 3 ? match[1] : null;
    const slug = match[match.length - 1];
    if (!token) return null;
    const res = await fetch(`https://${token}.recruitee.com/api/offers/`);
    if (!res.ok) return null;
    const data = await res.json();
    const job = (data.offers ?? []).find((o: any) => o.slug === slug);
    return job ? this.normalizeJob(job, token) : null;
  }

  async apply(): Promise<Partial<ApplicationSubmission>> {
    throw new Error('[Recruitee] Automated apply is not implemented yet. Apply manually via the posting URL.');
  }

  private normalizeJob(job: any, token: string): NormalizedVacancy {
    const description = stripHtml(job.description ?? '');
    const requirements = job.requirements ? stripHtml(job.requirements) : undefined;
    const modality = job.remote ? 'remote' : job.hybrid ? 'hybrid' : job.on_site ? 'onsite' : inferModality(job.location);
    return {
      id: String(job.id),
      platform: this.name,
      externalId: String(job.id),
      title: job.title,
      company: job.company_name || token,
      location: job.location || [job.city, job.country].filter(Boolean).join(', '),
      modality,
      description,
      requirements,
      url: job.careers_url || job.careers_apply_url || `https://${token}.recruitee.com/o/${job.slug}`,
      postedAt: job.published_at ? new Date(job.published_at) : job.created_at ? new Date(job.created_at) : undefined,
    };
  }
}
