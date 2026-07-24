/**
 * Shared in-memory cache of vacancy embeddings, keyed by vacancy URL (same
 * stable identity used for dedup elsewhere, e.g. the vacancies_user_url_idx
 * index). Mirrors the jobCache.ts pattern (fetch/compute ONCE, reuse across
 * every user's search) applied to embeddings instead of raw postings.
 *
 * Real waste found 2026-07-24: maybeSemanticAdjust re-embedded the SAME
 * vacancy's job text once per user whose search evaluated it as a borderline
 * candidate - N users searching within the same cache window paid for N
 * identical embedding calls on the exact same text. This cuts it to 1 call
 * per vacancy per cache cycle, regardless of how many users' searches touch
 * it. Cleared whenever the shared job cache refreshes (jobCache.ts) so it
 * never holds embeddings for postings that already fell out of the pool.
 */

const cache = new Map<string, number[]>();

export function getCachedVacancyEmbedding(url: string): number[] | undefined {
  return cache.get(url);
}

export function setCachedVacancyEmbedding(url: string, vector: number[]): void {
  cache.set(url, vector);
}

export function clearVacancyEmbeddingCache(): void {
  cache.clear();
}

export function vacancyEmbeddingCacheSize(): number {
  return cache.size;
}
