import { describe, it, expect } from 'vitest';
import { scoreVacancy, type NormalizedVacancy, type ScoringProfile } from '../fitScorer';

/**
 * Regression suite for fitScorer.ts - see eligibility.test.ts for the sibling
 * suite and the "why this file exists" note. Run `npm test` before/after
 * touching this file; add a case for any newly-found scoring bug.
 */

function profile(overrides: Partial<ScoringProfile> = {}): ScoringProfile {
  return {
    targetRoles: ['People Business Partner', 'HR Business Partner'],
    targetIndustries: [],
    targetSeniority: [],
    targetCountries: [],
    targetCompanies: [],
    excludedCompanies: [],
    excludedIndustries: [],
    excludedRoles: [],
    priorityKeywords: [],
    alertKeywords: [],
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    homeCountry: 'Peru',
    workModalityPrefs: {
      acceptsRemote: true,
      remoteScope: 'worldwide',
      remoteRegions: [],
      acceptsHybrid: false,
      hybridLocations: [],
      acceptsOnsite: false,
      onsiteLocations: [],
    },
    ...overrides,
  } as unknown as ScoringProfile;
}

function vacancy(overrides: Partial<NormalizedVacancy> = {}): NormalizedVacancy {
  return {
    id: 'v1',
    platform: 'greenhouse',
    title: 'People Business Partner',
    company: 'acme',
    location: 'Remote - US',
    description: 'This is a remote position, US only. 401(k) and other US benefits included.',
    requirements: '',
    url: 'https://job-boards.greenhouse.io/acme/jobs/1',
    ...overrides,
  };
}

describe('scoreVacancy - geography / local-only cap', () => {
  // Real, previously-fixed case: "Remote - US" reads as remote, but it's tied
  // to US residency - a candidate outside the US/without local-hire signals
  // should never see this rank as a genuine global-remote match.
  it('caps the score for a "Remote - US" posting for a non-US candidate', () => {
    const result = scoreVacancy(vacancy(), profile());
    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.warnings.some((w) => /extranjero|Remote US/i.test(w))).toBe(true);
  });

  it('does not cap a genuinely global-remote posting', () => {
    const result = scoreVacancy(
      vacancy({
        location: 'Remote',
        description: 'Fully remote role - we hire globally, from anywhere in the world.',
      }),
      profile(),
    );
    expect(result.score).toBeGreaterThan(50);
  });

  it('does not cap a local (home-country) posting', () => {
    const result = scoreVacancy(
      vacancy({ location: 'Lima, Peru', description: 'Office-based role in Lima.' }),
      profile(),
    );
    expect(result.score).toBeGreaterThan(50);
  });
});

describe('scoreVacancy - role match', () => {
  it('scores an exact target-role title match highly', () => {
    const result = scoreVacancy(
      vacancy({ title: 'People Business Partner', location: 'Lima, Peru' }),
      profile(),
    );
    expect(result.breakdown.roleMatch).toBeGreaterThanOrEqual(26);
  });

  it('falls back to inferring roles from experience when targetRoles is empty', () => {
    const p = profile({
      targetRoles: [],
      experience: [{ role: 'Backend Software Engineer', company: 'X', startDate: '2022-01', current: true } as any],
    });
    const result = scoreVacancy(
      vacancy({ title: 'Backend Software Engineer', location: 'Lima, Peru' }),
      p,
    );
    expect(result.breakdown.roleMatch).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /sin roles objetivo/i.test(w))).toBe(true);
  });
});
