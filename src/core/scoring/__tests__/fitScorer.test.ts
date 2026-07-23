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

  // Real request (2026-07-20, vael27@hotmail.com): target roles should be a
  // GUIDE, not a hard filter. A candidate who has run operations/P&L but only
  // listed fintech-leadership titles should still get a strong match on a
  // "Director of Operations" role their CV clearly qualifies them for.
  it('gives a solid role score to a role the CV qualifies for but that is not an explicit target', () => {
    const p = profile({
      targetRoles: ['Head of Fintech Partnerships', 'Country Manager, LATAM'],
      experience: [
        { role: 'Chief Operating Officer', company: 'Adasoft', startDate: '2021-01', current: false, endDate: '2023-04' } as any,
        { role: 'Regional Director, Latin America', company: 'Postindustria', startDate: '2023-04', current: true } as any,
      ],
    });
    const result = scoreVacancy(
      vacancy({ title: 'Director of Operations', location: 'Remote - Worldwide', description: 'Fully remote operations leadership role.' }),
      p,
    );
    // Not an explicit target, but the COO experience -> operations_leadership
    // family match, so it scores in the experience band (>=20), not the floor.
    expect(result.breakdown.roleMatch).toBeGreaterThanOrEqual(20);
    expect(result.warnings.some((w) => /relacionado con tu experiencia/i.test(w))).toBe(true);
  });

  it('does not inflate an unrelated role just because the profile has experience', () => {
    const p = profile({
      targetRoles: ['Head of Fintech Partnerships'],
      experience: [{ role: 'Chief Operating Officer', company: 'X', startDate: '2021-01', current: true } as any],
    });
    const result = scoreVacancy(
      vacancy({ title: 'Registered Nurse', location: 'Remote - Worldwide', description: 'Clinical nursing role.' }),
      p,
    );
    expect(result.breakdown.roleMatch).toBeLessThan(20);
  });
});

// Product decision 2026-07-24 (explicit user approval): a posting WRITTEN in
// English for a profile that declares languages but not English gets a
// moderate penalty + warning - before this, English was assumed universally
// and a Spanish-only profile received English vacancies with zero signal.
// Never a hard exclude; a profile with NO languages declared stays silent.
describe('scoreVacancy - posting language vs declared languages', () => {
  const englishDesc = 'You will work with our team on the product. This role is remote and you will report to the CTO. We are looking for someone that can start soon. The team ships fast and you will own the roadmap from day one. Our stack is modern and the culture is friendly.';
  const spanishDesc = 'Buscamos una persona para el equipo de producto. El rol es remoto y vas a reportar con el CTO. La empresa tiene una cultura amigable y el equipo lanza rapido. Este puesto es para una persona con experiencia en el area.';

  it('warns and penalizes when the posting is in English and the profile declares only Spanish', () => {
    const p = profile({ languages: [{ language: 'Español', proficiency: 'Nativo' }] } as any);
    const result = scoreVacancy(vacancy({ description: englishDesc, location: 'Remote - Worldwide' }), p);
    expect(result.warnings.some((w) => /redactada en inglés/i.test(w))).toBe(true);
  });

  it('stays silent for a Spanish posting', () => {
    const p = profile({ languages: [{ language: 'Español', proficiency: 'Nativo' }] } as any);
    const result = scoreVacancy(vacancy({ description: spanishDesc, location: 'Remote - Worldwide' }), p);
    expect(result.warnings.some((w) => /redactada en inglés/i.test(w))).toBe(false);
  });

  it('stays silent when the profile DOES declare English', () => {
    const p = profile({ languages: [{ language: 'Español', proficiency: 'Nativo' }, { language: 'Inglés', proficiency: 'Avanzado' }] } as any);
    const result = scoreVacancy(vacancy({ description: englishDesc, location: 'Remote - Worldwide' }), p);
    expect(result.warnings.some((w) => /redactada en inglés/i.test(w))).toBe(false);
  });

  it('stays silent when the profile declares no languages at all (nothing to judge)', () => {
    const p = profile({ languages: [] } as any);
    const result = scoreVacancy(vacancy({ description: englishDesc, location: 'Remote - Worldwide' }), p);
    expect(result.warnings.some((w) => /redactada en inglés/i.test(w))).toBe(false);
  });
});
