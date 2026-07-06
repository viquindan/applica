import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { eq } = await import('drizzle-orm');
  const { professionalProfiles, users } = await import('../src/db/schema');
  const { scoreVacancy } = await import('../src/core/scoring/fitScorer');

  const [profile] = await db.select().from(professionalProfiles).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);
  console.log('user.country:', user.country, '| user.location:', user.location);

  const base = {
    id: 'x', platform: 'linkedin', title: 'Country Manager', company: 'Acme',
    description: 'Leading regional operations and growth.', url: 'http://x',
  };
  const scoringProfile = {
    ...profile, homeCountry: user.country || user.location,
    salaryMin: user.salaryMin, salaryMax: user.salaryMax,
    workModality: user.workModality, workModalityPrefs: user.workModalityPrefs,
  } as any;

  for (const loc of ['Panama City, Panama', 'Mexico City, Mexico', 'Remote - LATAM', 'Remote - Worldwide', 'New York, NY', 'United States']) {
    const r = scoreVacancy({ ...base, location: loc } as any, scoringProfile);
    console.log(` ${String(r.score).padStart(3)} loc=${r.breakdown.locationMatch.toString().padStart(2)} ${loc}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
