import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { eq } = await import('drizzle-orm');
  const { professionalProfiles, users } = await import('../src/db/schema');
  const { scrapeLinkedInRemoteLatAm } = await import('../src/core/automation/linkedinScraper');
  const { scoreVacancy } = await import('../src/core/scoring/fitScorer');

  const [profile] = await db.select().from(professionalProfiles).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);

  const jobs = await scrapeLinkedInRemoteLatAm({
    roles: profile.targetRoles ?? [],
    locations: ['Mexico', 'LATAM', 'Remote'],
  });

  const scored = jobs.map((v) => ({
    score: scoreVacancy(v, {
      ...profile,
      salaryMin: user.salaryMin, salaryMax: user.salaryMax,
      workModality: user.workModality, workModalityPrefs: user.workModalityPrefs,
    } as any).score,
    v,
  })).sort((a, b) => b.score - a.score);

  console.log(`\nScored ${scored.length} enriched LinkedIn jobs. Top:\n`);
  for (const { score, v } of scored.slice(0, 12)) {
    const flag = score >= 70 ? ' APPLY' : score >= 60 ? ' prep' : '· filtered';
    console.log(` [${String(score).padStart(3)}] ${flag} ${v.title} @ ${v.company} - ${v.location}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
