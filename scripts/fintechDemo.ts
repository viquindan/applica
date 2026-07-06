/**
 * (1) Validates the freshly-harvested fintech/LATAM boards so the live worker
 * scans them (populates lastSeenJobCount -> proper cursor ordering).
 * (2) Runs the user's NEW grounded roles against those boards and SCORES each
 * result with the real fitScorer, showing the top matches.
 *
 * Run: npx tsx scripts/fintechDemo.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

const FINTECH: Record<string, string[]> = {
  greenhouse: ['sumup', 'ebury', 'tide', 'nubank', 'clara', 'n26', 'bitpanda', 'ebanx', 'gocardless', 'cobre', 'bitso', 'truelayer', 'baubap'],
  lever: ['dlocal', 'qonto', 'yuno', 'xepelin', 'swile', 'kavak', 'fintual'],
  ashby: ['pennylane', 'nubank', 'mollie', 'pleo', 'addi', 'zilch', 'belvo', 'kueski'],
  smartrecruiters: ['wise'],
};

async function main() {
  const { db } = await import('../src/db/client');
  const { eq } = await import('drizzle-orm');
  const { professionalProfiles, users } = await import('../src/db/schema');
  const { validateAtsBoard } = await import('../src/core/platforms/atsRegistry');
  const { scoreVacancy } = await import('../src/core/scoring/fitScorer');
  const { GreenhouseAdapter } = await import('../src/core/platforms/greenhouse');
  const { LeverAdapter } = await import('../src/core/platforms/lever');
  const { AshbyAdapter } = await import('../src/core/platforms/ashby');
  const { SmartRecruitersAdapter } = await import('../src/core/platforms/smartrecruiters');

  const adapters: Record<string, any> = {
    greenhouse: new GreenhouseAdapter(),
    lever: new LeverAdapter(),
    ashby: new AshbyAdapter(),
    smartrecruiters: new SmartRecruitersAdapter(),
  };

  // (1) Validate so the live registry has job counts for these boards.
  console.log('Validating fintech boards (populating registry counts)...');
  for (const [platform, tokens] of Object.entries(FINTECH)) {
    await Promise.all(tokens.map((t) => validateAtsBoard(platform, t).catch(() => false)));
  }

  // (2) Scored demo search with the user's current (grounded) roles.
  const [profile] = await db.select().from(professionalProfiles).limit(1);
  const [user] = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);
  const roles = profile.targetRoles ?? [];
  const locations = profile.targetCountries ?? [];
  console.log('\nGrounded roles:', roles.join(', '));

  const scored: Array<{ score: number; v: any }> = [];
  for (const [platform, tokens] of Object.entries(FINTECH)) {
    const adapter = adapters[platform];
    if (!adapter) continue;
    const found = await adapter.search({ boardTokens: tokens, roles, locations, maxAgeDays: 45, limit: 30 });
    for (const v of found) {
      const result = scoreVacancy(v, {
        ...profile,
        salaryMin: user.salaryMin, salaryMax: user.salaryMax,
        workModality: user.workModality, workModalityPrefs: user.workModalityPrefs,
      } as any);
      scored.push({ score: result.score, v });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  console.log(`\nMatched ${scored.length} vacancies on fintech/LATAM boards. Top by score:\n`);
  for (const { score, v } of scored.slice(0, 15)) {
    const flag = score >= 70 ? ' APPLY' : score >= 60 ? ' prep' : '· filtered';
    console.log(` [${String(score).padStart(3)}] ${flag} ${v.title} @ ${v.company} (${v.platform}) - ${v.location ?? '?'}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
