import { describe, expect, it } from 'vitest';
import { deriveSignals, type HistoryRow } from '../learnedSignals';
import type { NormalizedVacancy } from '../fitScorer';

/**
 * Regression suite for learnedSignals.ts. Origin: double engine audit
 * 2026-07-23 (N1+N2). deriveSignals() must stay a PURE function of
 * (vacancy, history): the search loop loads the user's history ONCE per run
 * (getUserApplicationHistory) and derives per-vacancy from memory, and
 * reEvaluate must pass the same signals the original search used - before
 * this, reEvaluate re-scored WITHOUT signals and any vacancy with a learned
 * adjustment oscillated between two scores every 6h, reshuffling the Feed.
 * These cases pin the derivation itself so the shared-load refactor (and any
 * future one) cannot silently change what the signals say.
 */

function vacancy(overrides: Partial<NormalizedVacancy> = {}): NormalizedVacancy {
  return {
    id: 'v1', platform: 'greenhouse', title: 'Sales Manager', company: 'Acme',
    location: 'Remote', description: '', requirements: '', url: 'https://x.test/1',
    ...overrides,
  } as NormalizedVacancy;
}

function row(overrides: Partial<HistoryRow>): HistoryRow {
  return { status: 'archived', responseStatus: 'unknown', title: 'Sales Manager', company: 'Other', ...overrides };
}

describe('deriveSignals - pure derivation from preloaded history', () => {
  it('returns neutral signals for an empty history', () => {
    const s = deriveSignals(vacancy(), []);
    expect(s.outcomeAdjustment).toBe(0);
    expect(s.preferenceAdjustment).toBe(0);
    expect(s.redFlags).toEqual([]);
  });

  it('penalizes a company the user repeatedly skipped (-15, red flag)', () => {
    const history = [
      row({ company: 'Acme', status: 'skipped' }),
      row({ company: 'Acme', status: 'archived' }),
    ];
    const s = deriveSignals(vacancy({ company: 'Acme' }), history);
    expect(s.preferenceAdjustment).toBe(-15);
    expect(s.redFlags?.length).toBe(1);
  });

  it('boosts a role family with a real contact track record (+15)', () => {
    const history = [
      row({ responseStatus: 'contacted', status: 'submitted' }),
      row({ responseStatus: 'contacted', status: 'submitted' }),
      row({ responseStatus: 'rejected', status: 'submitted' }),
    ];
    const s = deriveSignals(vacancy(), history);
    expect(s.outcomeAdjustment).toBe(15);
  });

  it('same inputs, same outputs - the property reEvaluate consistency relies on', () => {
    const history = [row({ company: 'Acme', status: 'skipped' }), row({ company: 'Acme', status: 'skipped' })];
    const a = deriveSignals(vacancy({ company: 'Acme' }), history);
    const b = deriveSignals(vacancy({ company: 'Acme' }), history);
    expect(a).toEqual(b);
  });
});
