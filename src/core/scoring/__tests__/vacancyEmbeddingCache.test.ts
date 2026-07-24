import { describe, expect, it, beforeEach } from 'vitest';
import { getCachedVacancyEmbedding, setCachedVacancyEmbedding, clearVacancyEmbeddingCache, vacancyEmbeddingCacheSize } from '../vacancyEmbeddingCache';

/**
 * Regression suite for the shared vacancy-embedding cache. Origin: 2026-07-24
 * fix - maybeSemanticAdjust used to re-embed the SAME vacancy's job text once
 * per user whose search evaluated it as borderline, even though the text
 * never changes within a cache cycle. This module is the fix: compute once,
 * reuse across every user, invalidated when the shared job pool refreshes
 * (see the clearVacancyEmbeddingCache() call in jobCache.ts).
 */
describe('vacancyEmbeddingCache', () => {
  beforeEach(() => clearVacancyEmbeddingCache());

  it('returns undefined for a URL never cached', () => {
    expect(getCachedVacancyEmbedding('https://x.test/1')).toBeUndefined();
  });

  it('returns what was stored for that exact URL', () => {
    setCachedVacancyEmbedding('https://x.test/1', [0.1, 0.2, 0.3]);
    expect(getCachedVacancyEmbedding('https://x.test/1')).toEqual([0.1, 0.2, 0.3]);
  });

  it('keeps different URLs independent (no cross-vacancy leakage)', () => {
    setCachedVacancyEmbedding('https://x.test/1', [1, 0, 0]);
    setCachedVacancyEmbedding('https://x.test/2', [0, 1, 0]);
    expect(getCachedVacancyEmbedding('https://x.test/1')).toEqual([1, 0, 0]);
    expect(getCachedVacancyEmbedding('https://x.test/2')).toEqual([0, 1, 0]);
  });

  it('clearVacancyEmbeddingCache (called on every jobCache refresh) empties the whole cache', () => {
    setCachedVacancyEmbedding('https://x.test/1', [1, 2, 3]);
    setCachedVacancyEmbedding('https://x.test/2', [4, 5, 6]);
    expect(vacancyEmbeddingCacheSize()).toBe(2);
    clearVacancyEmbeddingCache();
    expect(vacancyEmbeddingCacheSize()).toBe(0);
    expect(getCachedVacancyEmbedding('https://x.test/1')).toBeUndefined();
  });
});
