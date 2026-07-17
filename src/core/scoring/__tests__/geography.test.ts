import { describe, it, expect } from 'vitest';
import { detectCountryFromLocation } from '../geography';

/**
 * See eligibility.test.ts for the "why this file exists" note.
 */
describe('detectCountryFromLocation - US state abbreviations', () => {
  // Real case: the actual Pendo listing's location field was the bare string
  // "Raleigh, NC" - no trailing country/comma/anything. The state-code regex
  // required a comma+whitespace AFTER the code, so it silently never matched
  // "City, ST" with nothing following it (extremely common ATS formatting),
  // and detectCountryFromLocation returned undefined - which meant the R1
  // onsite-abroad hard-exclude never even considered this a foreign location.
  it('recognizes a bare "City, ST" location with nothing after the state code', () => {
    expect(detectCountryFromLocation('Raleigh, NC')).toBe('united states');
  });

  it('still recognizes "City, ST, Country" formatting', () => {
    expect(detectCountryFromLocation('Raleigh, NC, USA')).toBe('united states');
  });

  it('still recognizes a full country name', () => {
    expect(detectCountryFromLocation('Raleigh, North Carolina, United States')).toBe('united states');
  });

  it('does not false-positive on a Peru location', () => {
    expect(detectCountryFromLocation('Lima, Peru')).toBe('peru');
  });
});
