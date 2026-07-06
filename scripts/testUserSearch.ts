/**
 * LIVE end-to-end search test for the real user, using the CURRENT code.
 * Proves both fixes: (1) all 5 platforms are searched, (2) region/continent
 * location targets now match. Read-only - does not write vacancies.
 *
 * Run: npx tsx scripts/testUserSearch.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { getActiveAtsBoardTokensBatch } = await import('../src/core/platforms/atsRegistry');
  const { GreenhouseAdapter } = await import('../src/core/platforms/greenhouse');
  const { LeverAdapter } = await import('../src/core/platforms/lever');
  const { AshbyAdapter } = await import('../src/core/platforms/ashby');
  const { SmartRecruitersAdapter } = await import('../src/core/platforms/smartrecruiters');
  const { RecruiteeAdapter } = await import('../src/core/platforms/recruitee');

  const adapters: Record<string, any> = {
    greenhouse: new GreenhouseAdapter(),
    lever: new LeverAdapter(),
    ashby: new AshbyAdapter(),
    smartrecruiters: new SmartRecruitersAdapter(),
    recruitee: new RecruiteeAdapter(),
  };

  const prof = (await db.execute(sql`SELECT target_roles, target_countries FROM professional_profiles LIMIT 1`)).rows[0] as any;
  const roles: string[] = prof.target_roles ?? [];
  const locations: string[] = prof.target_countries ?? [];
  console.log('Roles:', roles.join(', '));
  console.log('Countries:', locations.join(', '));
  console.log('');

  let grandTotal = 0;
  for (const [name, adapter] of Object.entries(adapters)) {
    const boardTokens = await getActiveAtsBoardTokensBatch(name, 60, 0);
    const found = await adapter.search({ boardTokens, roles, locations, maxAgeDays: 30, limit: 25 });
    grandTotal += found.length;
    console.log(`[${name}] boards=${boardTokens.length} -> matched ${found.length} vacancies`);
    for (const v of found.slice(0, 3)) {
      console.log(` • "${v.title}" @ ${v.company} | ${v.location ?? '?'}`);
    }
  }

  console.log(`\n=== TOTAL matched across all 5 platforms: ${grandTotal} ===`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
