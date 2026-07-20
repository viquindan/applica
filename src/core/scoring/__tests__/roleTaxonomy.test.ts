import { describe, expect, it } from 'vitest';
import { getRoleFamily, roleMatches } from '../roleTaxonomy';

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
