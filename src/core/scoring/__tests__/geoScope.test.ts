import { describe, it, expect } from 'vitest';
import { detectGeoScopeFromText, geoScopeIncludesCountry } from '../geography';
import { detectHiringSignals, evaluateEligibility } from '../eligibility';
import { scoreVacancy, type NormalizedVacancy, type ScoringProfile } from '../fitScorer';

/**
 * Regression suite for the hiring-scope engine (detectGeoScopeFromText and its
 * wiring into eligibility R5 + the fitScorer scope boost/cap).
 *
 * Root problem (reported by the user, 2026-07-18, after QA #2 with the
 * dev.peru.qa account - persona: software dev in Peru seeking remote-global):
 * "remote" almost never means "we hire in any country". Most US postings are
 * remote-US-only; many others are remote-EMEA/APAC. The engine used to decide
 * geography almost exclusively from the short `location` string, so:
 *  - "Fully remote" marketing marked US/EMEA-only roles as globally hireable.
 *  - "Remote - EMEA" for a LATAM candidate was never capped nor excluded.
 *  - "Remote - Americas" (which DOES include Peru) resolved to no region at
 *    all and was punished as foreign (part of the 25/28 over-filtering).
 *  - Restrictions living in the DESCRIPTION ("open to candidates in Europe")
 *    were invisible.
 * See eligibility.test.ts for the "why this file exists" note.
 */

function vacancy(overrides: Partial<NormalizedVacancy> = {}): NormalizedVacancy {
  return {
    id: 'v1',
    platform: 'greenhouse',
    title: 'Senior Software Engineer',
    company: 'acme',
    location: 'Remote',
    description: '',
    requirements: '',
    url: 'https://job-boards.greenhouse.io/acme/jobs/1',
    ...overrides,
  };
}

const peruProfile = {
  homeCountry: 'Peru',
  targetCountries: [] as string[],
  languages: [] as Array<{ language: string; proficiency: string }>,
  relocationAvailable: false,
  workAuthorization: [] as { country: string; status: string }[],
};

function scoringProfile(overrides: Partial<ScoringProfile> = {}): ScoringProfile {
  return {
    targetRoles: ['Software Engineer'],
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

describe('detectGeoScopeFromText', () => {
  it('reads a regional restriction from the location string', () => {
    const scope = detectGeoScopeFromText('Remote - EMEA', '');
    expect(scope.scope).toBe('restricted');
    expect(geoScopeIncludesCountry(scope, 'Peru')).toBe(false);
    expect(geoScopeIncludesCountry(scope, 'Germany')).toBe(true);
  });

  it('treats "Remote - Americas" as including both LATAM and North America', () => {
    const scope = detectGeoScopeFromText('Remote - Americas', '');
    expect(geoScopeIncludesCountry(scope, 'Peru')).toBe(true);
    expect(geoScopeIncludesCountry(scope, 'United States')).toBe(true);
    expect(geoScopeIncludesCountry(scope, 'Germany')).toBe(false);
  });

  it('reads a restriction that only lives in the description', () => {
    const scope = detectGeoScopeFromText('Remote', 'This role is only open to candidates based in Europe.');
    expect(scope.scope).toBe('restricted');
    expect(scope.restrictive).toBe(true);
    expect(geoScopeIncludesCountry(scope, 'Peru')).toBe(false);
  });

  it('reads a POSITIVE description scope that includes the candidate', () => {
    const scope = detectGeoScopeFromText('Remote', 'We are open to candidates located in Latin America and Southern Europe.');
    expect(geoScopeIncludesCountry(scope, 'Peru')).toBe(true);
  });

  it('resolves the candidate country even when declared in Spanish', () => {
    const scope = detectGeoScopeFromText('Remote', 'Open to candidates based in the United States.');
    expect(geoScopeIncludesCountry(scope, 'Estados Unidos')).toBe(true);
    expect(geoScopeIncludesCountry(scope, 'Perú')).toBe(false);
  });

  it('classifies "work from anywhere in the world" as global', () => {
    const scope = detectGeoScopeFromText('Remote', 'Work from anywhere in the world - we are async-first.');
    expect(scope.scope).toBe('global');
    expect(geoScopeIncludesCountry(scope, 'Peru')).toBe(true);
  });

  it('does not read "remote-first company with hubs in Spain" as a hiring restriction', () => {
    const scope = detectGeoScopeFromText('Remote', 'We are a remote-first company with hubs in Spain and a distributed culture.');
    expect(scope.scope).toBe('unknown');
  });

  it('does not read ordinary prose "join us" as a US restriction', () => {
    const scope = detectGeoScopeFromText('Remote', 'Come build the future with us. This is a remote, async team.');
    expect(geoScopeIncludesCountry(scope, 'Peru')).not.toBe(false);
  });

  it('returns unknown (never false) when there is no geographic signal at all', () => {
    const scope = detectGeoScopeFromText('Remote', 'Great engineering culture and competitive salary.');
    expect(scope.scope).toBe('unknown');
    expect(geoScopeIncludesCountry(scope, 'Peru')).toBeUndefined();
  });
});

describe('detectHiringSignals - "fully remote" is not "hires globally"', () => {
  // "Fully remote"/"100% remote" is near-universal marketing in US-only and
  // EMEA-only postings; it says the role has no office, not that the employer
  // hires in any country. It used to match GLOBAL_FRIENDLY_RX and exempt the
  // posting from every geographic gate.
  it('does not mark a bare "fully remote" posting as global-friendly', () => {
    const signals = detectHiringSignals(vacancy({
      description: 'This is a fully remote position within EMEA. 100% remote work.',
    }));
    expect(signals.globalFriendly).toBe(false);
  });

  it('still marks genuinely global wording as global-friendly', () => {
    const signals = detectHiringSignals(vacancy({
      description: 'Fully remote - we hire globally, from anywhere in the world.',
    }));
    expect(signals.globalFriendly).toBe(true);
  });
});

describe('evaluateEligibility - R5 (explicit hiring scope excludes the candidate)', () => {
  it('excludes a remote role explicitly restricted to a region that excludes the candidate', () => {
    const v = vacancy({
      location: 'Remote',
      description: 'You can work from home. Candidates must be based in EMEA.',
    });
    const result = evaluateEligibility(v, peruProfile);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => /EUROPA/i.test(r))).toBe(true);
  });

  it('does NOT exclude when the wording is ambiguous (left to the scorer cap)', () => {
    const v = vacancy({
      location: 'Remote',
      description: 'We are hiring across Europe for this position.',
    });
    expect(evaluateEligibility(v, peruProfile).eligible).toBe(true);
  });

  it('does NOT exclude when the restricted scope includes the candidate', () => {
    const v = vacancy({
      location: 'Remote',
      description: 'This role is only open to candidates in Latin America.',
    });
    expect(evaluateEligibility(v, peruProfile).eligible).toBe(true);
  });

  it('respects declared relocation availability', () => {
    const v = vacancy({
      location: 'Remote',
      description: 'Candidates must be based in EMEA.',
    });
    expect(evaluateEligibility(v, { ...peruProfile, relocationAvailable: true }).eligible).toBe(true);
  });
});

describe('evaluateEligibility - languages (Portuguese + Spanish-declared aliases)', () => {
  it('excludes a role requiring fluent Portuguese for a candidate who did not declare it', () => {
    const v = vacancy({
      location: 'Remote - Brazil',
      description: 'Fluent Portuguese is required for this role.',
    });
    const result = evaluateEligibility(v, { ...peruProfile, targetCountries: ['Brazil'] });
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => /portuguese/i.test(r))).toBe(true);
  });

  it('recognizes the language when declared under its Spanish name', () => {
    const v = vacancy({
      location: 'Remote - Brazil',
      description: 'Fluent Portuguese is required for this role.',
    });
    const result = evaluateEligibility(v, {
      ...peruProfile,
      targetCountries: ['Brazil'],
      languages: [{ language: 'Portugués', proficiency: 'Nativo' }],
    });
    expect(result.eligible).toBe(true);
  });
});

describe('scoreVacancy - hiring-scope boost and cap', () => {
  it('boosts "Remote - Americas" for a Peru candidate instead of punishing it as foreign', () => {
    const result = scoreVacancy(vacancy({ location: 'Remote - Americas' }), scoringProfile());
    expect(result.breakdown.locationMatch).toBeGreaterThanOrEqual(13);
  });

  it('boosts a plain "Remote" role whose description opens hiring to the candidate region', () => {
    const result = scoreVacancy(
      vacancy({ location: 'Remote', description: 'We are open to candidates located in South America.' }),
      scoringProfile(),
    );
    expect(result.breakdown.locationMatch).toBeGreaterThanOrEqual(13);
  });

  it('caps a remote role whose ambiguous scope excludes the candidate region', () => {
    const result = scoreVacancy(
      vacancy({
        location: 'Remote - EMEA',
        title: 'Software Engineer',
        description: 'We are hiring across Europe. Modern stack, great team.',
      }),
      scoringProfile(),
    );
    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.warnings.some((w) => w.includes('desde tu país no es elegible'))).toBe(true);
  });

  // Real rows from the dev.peru.qa production account (2026-07-18): a dozen
  // San Jose/Mountain View onsite postings reached the feed at 61-71 for a
  // remote-global Peru candidate - a plain US-city location is just as
  // US-scoped as "Remote - US", but nothing ever compared it against home.
  it('caps a plain US-city onsite posting for a Peru candidate', () => {
    const result = scoreVacancy(
      vacancy({
        location: 'San Jose, California',
        description: 'Great engineering team. Modern stack. Remote-friendly culture within the office.',
      }),
      scoringProfile(),
    );
    expect(result.score).toBeLessThanOrEqual(50);
  });

  // Counter-case from the same real data: "Argentina Remote" postings were the
  // TOP matches (74-85) and are legitimate by design - LATAM employers hire
  // across LATAM (geoPriority tier 'region'). The scope cap must not touch
  // in-region matches.
  it('does NOT cap an in-region "Remote - Argentina" posting for a Peru candidate', () => {
    const result = scoreVacancy(
      vacancy({ location: 'Argentina Remote', description: 'Fully remote role for our LATAM team.' }),
      scoringProfile(),
    );
    expect(result.score).toBeGreaterThan(50);
  });

  // Real row: "Home Based - Americas" fell through as not_remote and lost its
  // region entirely.
  it('treats "Home Based - Americas" as regional remote including Peru', () => {
    const result = scoreVacancy(vacancy({ location: 'Home Based - Americas' }), scoringProfile());
    expect(result.breakdown.locationMatch).toBeGreaterThanOrEqual(13);
  });

  it('does not cap when the user explicitly targets the posting country', () => {
    const result = scoreVacancy(
      vacancy({ location: 'San Jose, California', description: 'Onsite role in our San Jose office.' }),
      scoringProfile({ targetCountries: ['United States'] }),
    );
    expect(result.warnings.every((w) => !w.includes('desde tu país no es elegible'))).toBe(true);
  });

  it('caps an EMEA-only remote role even for a US candidate (cap is home-agnostic)', () => {
    const result = scoreVacancy(
      vacancy({ location: 'Remote - EMEA', description: 'We are hiring across Europe.' }),
      scoringProfile({ homeCountry: 'United States' }),
    );
    expect(result.score).toBeLessThanOrEqual(50);
  });
});

describe('scoreVacancy - declared English level vs posting demands', () => {
  it('penalizes and warns when the posting demands fluent English and the profile declares intermediate', () => {
    const result = scoreVacancy(
      vacancy({ location: 'Remote - Americas', description: 'Fluent English is required for daily communication.' }),
      scoringProfile({ languages: [{ language: 'Inglés', proficiency: 'Intermedio' }] } as any),
    );
    expect(result.breakdown.languagePenalty).toBe(10);
    expect(result.warnings.some((w) => /inglés/i.test(w))).toBe(true);
  });

  it('does not penalize an advanced English speaker', () => {
    const result = scoreVacancy(
      vacancy({ location: 'Remote - Americas', description: 'Fluent English is required for daily communication.' }),
      scoringProfile({ languages: [{ language: 'Inglés', proficiency: 'Avanzado' }] } as any),
    );
    expect(result.breakdown.languagePenalty).toBe(0);
  });

  it('stays silent when English was never declared (nothing to judge)', () => {
    const result = scoreVacancy(
      vacancy({ location: 'Remote - Americas', description: 'Fluent English is required.' }),
      scoringProfile(),
    );
    expect(result.breakdown.languagePenalty).toBe(0);
  });
});
