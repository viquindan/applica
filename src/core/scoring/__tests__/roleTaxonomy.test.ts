import { describe, expect, it } from 'vitest';
import { getRoleFamily, getSeniorityBand, roleMatches } from '../roleTaxonomy';

// Real bug found in production (2026-07-20, account vael27@hotmail.com):
// candidate gathering collapsed to 6 results out of a 58k+ job cache. Cause:
// getRoleFamily required an alias like "vp operations" to appear as one
// contiguous substring - any qualifier word between the seniority prefix and
// the function noun broke it, and real executive titles almost always have
// one. 5 of the user's 9 target roles matched NO family at all, even
// against a near-identical real posting title.
describe('roleTaxonomy - family matching survives inserted qualifier words', () => {
  it('"VP of Credit Operations" maps to operations_leadership (previously NO FAMILY)', () => {
    expect(getRoleFamily('VP of Credit Operations')).toBe('operations_leadership');
  });

  it('"VP of Credit Operations" matches a real "VP Operations" posting', () => {
    expect(roleMatches('VP Operations', 'VP of Credit Operations')).toBe(true);
  });

  it('"VP of Credit Operations" matches a real "Chief Operating Officer" posting', () => {
    expect(roleMatches('Chief Operating Officer', 'VP of Credit Operations')).toBe(true);
  });

  it('"Head of Payments Strategy" maps to strategy_leadership (previously NO FAMILY)', () => {
    expect(getRoleFamily('Head of Payments Strategy')).toBe('strategy_leadership');
  });

  it('"Head of Payments Strategy" matches a real "Head of Strategy" posting', () => {
    expect(roleMatches('Head of Strategy', 'Head of Payments Strategy')).toBe(true);
  });

  it('"Head of Fintech Partnerships" maps to strategy_leadership (new partnerships aliases)', () => {
    expect(getRoleFamily('Head of Fintech Partnerships')).toBe('strategy_leadership');
  });

  it('"Head of Fintech Partnerships" matches a real "Head of Partnerships" posting', () => {
    expect(roleMatches('Head of Partnerships', 'Head of Fintech Partnerships')).toBe(true);
  });

  it('does not match an unrelated junior title just because it shares one word ("operations")', () => {
    expect(roleMatches('Junior Data Operations Analyst', 'VP of Credit Operations')).toBe(false);
  });

  it('does not match a completely unrelated title', () => {
    expect(roleMatches('Marketing Coordinator', 'VP of Credit Operations')).toBe(false);
  });
});

// Real finding from the double engine audit (2026-07-23): ROLE_FAMILIES
// contained ONLY *_leadership families, so getRoleFamily() returned undefined
// for every IC / non-tech title. That didn't just weaken the 30-pt role
// component of the score - roleMatches() also pre-filters the candidate POOL
// (atsSearchHelpers.ts), so "Backend Engineer" never even entered the funnel
// for a user targeting "Software Engineer" (recall lost at the source).
// Verified live: 4 of 6 production accounts ended with 0 final matches; the
// dev-persona QA account fell squarely in this hole.
describe('roleTaxonomy - IC and non-tech families (audit 2026-07-23)', () => {
  it('recognizes the exact titles the audit verified as unrecognized', () => {
    for (const title of [
      'Software Engineer', 'Data Analyst', 'Accountant', 'Registered Nurse',
      'UX Designer', 'DevOps Engineer', 'Desarrollador de Software', 'Contador',
    ]) {
      expect(getRoleFamily(title), title).toBeDefined();
    }
  });

  it('matches sibling engineering titles through the family (the audit\'s exact failing pair)', () => {
    expect(roleMatches('Backend Engineer', 'Software Engineer')).toBe(true);
    expect(roleMatches('Senior Full Stack Developer', 'Software Engineer')).toBe(true);
    expect(roleMatches('iOS Developer', 'Mobile Engineer')).toBe(true);
  });

  it('bridges Spanish and English titles in the same family', () => {
    expect(roleMatches('Senior Accountant', 'Contador')).toBe(true);
    expect(roleMatches('Desarrollador Backend', 'Software Engineer')).toBe(true);
    // Spanish connectives must not block the match ("de" is a stopword now).
    expect(roleMatches('Desarrollador Senior de Software', 'Software Engineer')).toBe(true);
  });

  it('keeps cross-family precision: unrelated roles still do not match', () => {
    // Invariant #5 (the original "Registered Nurse for a COO" guard) must
    // survive the new families: nursing now HAS a family, but not the
    // operations one.
    expect(roleMatches('Registered Nurse', 'COO')).toBe(false);
    expect(roleMatches('Registered Nurse', 'Software Engineer')).toBe(false);
    expect(roleMatches('Account Executive', 'Accountant')).toBe(false);
    expect(roleMatches('UX Designer', 'Data Analyst')).toBe(false);
  });

  it('leadership families still win ties (declared first, order matters)', () => {
    expect(getRoleFamily('Chief Operating Officer')).toBe('operations_leadership');
    expect(getRoleFamily('Director of Product')).toBe('product_leadership');
    expect(getRoleFamily('Head of Engineering')).toBe('engineering_leadership');
  });

  it('seniority banding is untouched by the new families', () => {
    expect(getSeniorityBand('Senior Software Engineer')).toBe('senior');
    expect(getSeniorityBand('Staff Engineer')).toBe('principal');
  });
});
