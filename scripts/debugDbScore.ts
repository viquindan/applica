import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { eq, sql } = await import('drizzle-orm');
  const { professionalProfiles, users, vacancies } = await import('../src/db/schema');
  const { scoreVacancy } = await import('../src/core/scoring/fitScorer');

  const [profile] = await db.select().from(professionalProfiles).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);
  console.log('targetRoles:', JSON.stringify(profile.targetRoles));
  console.log('homeCountry:', user.country, '\n');

  const rows = (await db.execute(sql`SELECT title, location, score, normalized_data, red_flags FROM vacancies ORDER BY score DESC NULLS LAST LIMIT 4`)).rows as any[];

  const sp = {
    ...profile, homeCountry: user.country || user.location,
    salaryMin: user.salaryMin, salaryMax: user.salaryMax,
    workModality: user.workModality, workModalityPrefs: user.workModalityPrefs,
  } as any;

  for (const r of rows) {
    const v = r.normalized_data;
    const res = scoreVacancy(v, sp);
    console.log(`"${r.title}" @ ${r.location}`);
    console.log(` stored score: ${r.score} | re-scored now: ${res.score}`);
    console.log(` breakdown: ${JSON.stringify(res.breakdown)}`);
    console.log(` descLen: ${(v.description ?? '').length} | redFlags: ${JSON.stringify(res.redFlags)}`);
    console.log('');
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
