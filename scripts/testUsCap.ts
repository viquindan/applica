import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { eq } = await import('drizzle-orm');
  const { professionalProfiles, users } = await import('../src/db/schema');
  const { scoreVacancy } = await import('../src/core/scoring/fitScorer');

  const [profile] = await db.select().from(professionalProfiles).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);
  const sp = { ...profile, homeCountry: user.country || user.location, salaryMin: user.salaryMin, salaryMax: user.salaryMax, workModality: user.workModality, workModalityPrefs: user.workModalityPrefs } as any;

  const cases: Array<[string, any]> = [
    ['LatAm role, no US signals', { title: 'Country Manager', location: 'Mexico City, Mexico', description: 'Lead regional growth across LATAM.' }],
    ['Remote US in location', { title: 'Country Manager', location: 'Remote US', description: 'Lead growth.' }],
    ['Mentions 401k', { title: 'Director of Growth', location: 'Remote', description: 'We offer competitive salary, 401k matching, and health benefits.' }],
    ['Mentions Texas state law', { title: 'VP of Sales', location: 'Remote', description: 'Per the laws of the state of Texas, pay range is disclosed.' }],
    ['Authorized to work in the US', { title: 'Head of Growth', location: 'Anywhere', description: 'Candidates must be authorized to work in the United States.' }],
  ];

  for (const [label, v] of cases) {
    const r = scoreVacancy({ id: 'x', platform: 'linkedin', url: 'http://x', company: 'Acme', ...v } as any, sp);
    const flagged = r.warnings.some((w) => w.includes('EE. UU.'));
    console.log(` score=${String(r.score).padStart(3)} usOnlyCap=${flagged ? 'YES' : 'no '} ${label}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
