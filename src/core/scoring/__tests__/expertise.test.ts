import { describe, expect, it } from 'vitest';
import { buildExpertiseProfile, expertiseMatchRatio } from '../expertise';

/**
 * Regression suite for expertise.ts. Origin: double engine audit 2026-07-23
 * (M1). expertiseMatchRatio had a `|| haystack.includes(term)` substring
 * fallback that voided the word-boundary check: short generic skills matched
 * INSIDE unrelated words ("web" in "webinar", "app" in "application"),
 * measured live at up to 0.75 ratio against pure noise - leaking ~+5 pts of
 * the +12 expertise component into irrelevant vacancies.
 */

const profileWithShortSkills = {
  skills: [
    { skill: 'React', level: 'advanced' },
    { skill: 'Web', level: 'advanced' },
    { skill: 'App', level: 'advanced' },
    { skill: 'API', level: 'advanced' },
  ],
} as any;

describe('expertiseMatchRatio - word boundaries (audit 2026-07-23, M1)', () => {
  it('scores 0 against noise text whose words merely CONTAIN the skills', () => {
    const expertise = buildExpertiseProfile(profileWithShortSkills);
    // The audit's evidence text: "web"⊂"webinar", "app"⊂"application"/"apply".
    const noise = 'A happy application-free wrapper. Apply your happiness. Strapi webinar.';
    expect(expertiseMatchRatio(expertise, noise)).toBe(0);
  });

  it('still scores high when the skills appear as real standalone words', () => {
    const expertise = buildExpertiseProfile(profileWithShortSkills);
    const relevant = 'We need React and Web development skills to build our App and its public API.';
    expect(expertiseMatchRatio(expertise, relevant)).toBeGreaterThan(0.7);
  });
});
