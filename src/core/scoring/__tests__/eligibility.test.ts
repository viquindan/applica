import { describe, it, expect } from 'vitest';
import { detectHiringSignals, evaluateEligibility } from '../eligibility';
import type { NormalizedVacancy } from '../fitScorer';

/**
 * Regression suite for the search engine's core matching rules
 * (eligibility.ts + the hiring-signal detection it depends on).
 *
 * This exists because the scoring/eligibility engine has been tuned across
 * many sessions and is easy to silently regress when a fresh session (no
 * memory of prior fixes) touches these files again. Every case here is a
 * REAL bug found in production, not a hypothetical - see docs/DECISIONS.md
 * and docs/STATUS.md for the incident each one traces back to. Before
 * changing fitScorer.ts / eligibility.ts / geography.ts, run `npm test` and
 * keep it green; when you fix a new scoring bug, add a case here so it can
 * never come back silently in a future session.
 */

function vacancy(overrides: Partial<NormalizedVacancy> = {}): NormalizedVacancy {
  return {
    id: 'v1',
    platform: 'greenhouse',
    title: 'Director, People Business Partner - GTM',
    company: 'pendo',
    location: 'Raleigh, NC',
    description: '',
    requirements: '',
    url: 'https://job-boards.greenhouse.io/pendo/jobs/1',
    ...overrides,
  };
}

describe('detectHiringSignals', () => {
  // Real case (2026-07-17): a Raleigh, NC-based "Director, People Partner GTM"
  // role scored 82% for a Peru-based candidate seeking remote-global-only work,
  // because "Lead a small, globally distributed team of People Partners"
  // matched the global-friendly regex - even though the same posting also said
  // "This role is based in our Raleigh office" a few lines above. A manager's
  // own reports being distributed says nothing about where the MANAGER'S role
  // can be performed.
  it('does not treat "globally distributed team" as a global-friendly signal', () => {
    const v = vacancy({
      description: `
        <p>The Director, People Partner GTM owns the people agenda for Pendo's Revenue and Marketing organization.</p>
        <p>This role is based in our Raleigh office.</p>
        <li>Lead a small, globally distributed team of People Partners supporting Revenue and Marketing.</li>
      `,
    });
    const signals = detectHiringSignals(v);
    expect(signals.globalFriendly).toBe(false);
  });

  it('still treats "globally distributed company/workforce" as global-friendly', () => {
    const v = vacancy({
      description: 'We are a fully distributed workforce - work from anywhere in the world.',
    });
    const signals = detectHiringSignals(v);
    expect(signals.globalFriendly).toBe(true);
  });

  it('recognizes "this role is based in our X office" as an explicit restriction override', () => {
    const v = vacancy({
      description: 'We are a globally distributed company. This role is based in our Austin office.',
    });
    const signals = detectHiringSignals(v);
    // The explicit office-based statement must win over the generic "globally
    // distributed company" branding - restrictionOverride should suppress it.
    expect(signals.globalFriendly).toBe(false);
  });

  it('flags "Remote - US" as a soft local-hire signal, not global-friendly', () => {
    const v = vacancy({ location: 'Remote - US', description: 'This is a remote position (US only).' });
    const signals = detectHiringSignals(v);
    expect(signals.globalFriendly).toBe(false);
    expect(signals.softForeignBlock).toBe(true);
  });
});

describe('evaluateEligibility - R1 (onsite/hybrid abroad)', () => {
  const profile = {
    homeCountry: 'Peru',
    targetCountries: [] as string[],
    languages: [] as string[],
    relocationAvailable: false,
    workAuthorization: [] as { country: string; status: string }[],
  };

  it('excludes an onsite US role for a candidate with no relocation/work-auth/target-country match', () => {
    const v = vacancy({
      description: `
        <p>This role is based in our Raleigh office.</p>
        <li>Lead a small, globally distributed team of People Partners.</li>
      `,
    });
    const result = evaluateEligibility(v, profile);
    expect(result.eligible).toBe(false);
  });

  it('allows the same onsite role when the candidate declared relocation availability', () => {
    const v = vacancy({ description: 'This role is based in our Raleigh office.' });
    const result = evaluateEligibility(v, { ...profile, relocationAvailable: true });
    expect(result.eligible).toBe(true);
  });

  it('allows the same onsite role when the candidate already holds US work authorization', () => {
    const v = vacancy({ description: 'This role is based in our Raleigh office.' });
    const result = evaluateEligibility(v, {
      ...profile,
      workAuthorization: [{ country: 'United States', status: 'Permanent Resident' }],
    });
    expect(result.eligible).toBe(true);
  });

  it('allows the same onsite role when the US is one of the candidate\'s explicit target countries', () => {
    const v = vacancy({ description: 'This role is based in our Raleigh office.' });
    const result = evaluateEligibility(v, { ...profile, targetCountries: ['United States'] });
    expect(result.eligible).toBe(true);
  });

  it('does not exclude a genuinely global-remote role', () => {
    const v = vacancy({
      location: 'Remote',
      description: 'Fully remote, work from anywhere in the world - we are a globally distributed workforce.',
    });
    const result = evaluateEligibility(v, profile);
    expect(result.eligible).toBe(true);
  });

  // Real bug (2026-07-20, vael27@hotmail.com): a fully-remote Canonical role
  // located "Home Based - Americas" was hard-excluded as "presencial en LATAM"
  // for a Panama candidate because its description mentioned "Teams meet in
  // person 2-4 times a year" and "very few office-based roles" - incidental
  // phrasing of a remote job that tripped the onsite regex. The explicit
  // "Home Based" location must win over those weak description matches. These
  // were 3 of the candidate's highest-scoring roles (81-83), silently dropped.
  it('does not exclude a "Home Based - Americas" role that mentions occasional in-person meetings', () => {
    const v = vacancy({
      title: 'Public Cloud Project Manager',
      company: 'canonical',
      location: 'Home Based - Americas',
      description: 'Canonical is a pioneer of global distributed collaboration, with 1200+ colleagues in 75+ countries and very few office-based roles. Teams meet two to four times yearly in person, in interesting locations around the world.',
    });
    const result = evaluateEligibility({ ...v, homeCountry: 'Panama' } as any, { ...profile, homeCountry: 'Panama' });
    expect(result.eligible).toBe(true);
  });

  // Guard against over-correcting: a location that does NOT declare remote and
  // clearly describes a physical office abroad must still be excluded.
  it('still excludes a genuine onsite role abroad whose location names a foreign city', () => {
    const v = vacancy({
      location: 'Berlin, Germany',
      description: 'This is an in-office role. You will work on-site 5 days a week at our Berlin headquarters.',
    });
    const result = evaluateEligibility({ ...v, homeCountry: 'Panama' } as any, { ...profile, homeCountry: 'Panama' });
    expect(result.eligible).toBe(false);
  });
});
