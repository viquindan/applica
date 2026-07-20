import { describe, expect, it } from 'vitest';
import { matchesFilters } from '../atsSearchHelpers';
import type { NormalizedVacancy } from '../../scoring/fitScorer';

// Real bug found in production (2026-07-20, account vael27@hotmail.com):
// a candidate accepting worldwide remote, with targetCountries=[Colombia,
// Panama], got only ~12 candidates out of 889 role-matched jobs. Having
// targetCountries paradoxically SHRANK the pool: the location pre-filter
// only kept globally/regionally-scoped remote roles plus exact-country
// matches, discarding 66 remote postings ("Remote", "Remote - Colombia",
// "Remote US"...) before the scorer - which reads the full description and
// is the right place to judge hiring footprint - ever saw them.

function job(location: string): NormalizedVacancy {
  return {
    id: location,
    title: 'Head of Partnerships',
    company: 'Acme',
    location,
    url: 'https://example.com',
    platform: 'greenhouse',
    description: '',
    postedAt: new Date(),
  } as NormalizedVacancy;
}

const roles = ['Head of Partnerships'];
const locations = ['Colombia', 'Panama'];

describe('matchesFilters - remote-accepting candidate keeps all remote postings', () => {
  it('keeps a bare "Remote" posting when acceptsRemote (was dropped before)', () => {
    expect(matchesFilters(job('Remote'), { roles, locations, acceptsRemote: true })).toBe(true);
  });

  it('keeps a "Remote US" posting when acceptsRemote (scorer decides fit, not the pre-filter)', () => {
    expect(matchesFilters(job('Remote US'), { roles, locations, acceptsRemote: true })).toBe(true);
  });

  it('keeps "Remote - Colombia" (target country + region) when acceptsRemote', () => {
    expect(matchesFilters(job('Remote - Colombia'), { roles, locations, acceptsRemote: true })).toBe(true);
  });

  it('still keeps a globally-scoped remote posting regardless of acceptsRemote', () => {
    expect(matchesFilters(job('Home based - Worldwide'), { roles, locations, acceptsRemote: false })).toBe(true);
  });

  it('does NOT keep a bare "Remote" posting when the candidate does not accept remote', () => {
    expect(matchesFilters(job('Remote'), { roles, locations, acceptsRemote: false })).toBe(false);
  });

  it('does NOT keep a foreign ONSITE role even when acceptsRemote (not remote at all)', () => {
    expect(matchesFilters(job('New York, NY'), { roles, locations, acceptsRemote: true })).toBe(false);
  });

  it('keeps an exact target-country onsite role (Panama) regardless of remote pref', () => {
    expect(matchesFilters(job('Panama City, Panama'), { roles, locations, acceptsRemote: false })).toBe(true);
  });
});
