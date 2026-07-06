import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
// Queues a normal search that ADDS to the existing vacancies (never deletes).
// The worker advances the board cursor each run, so calling this repeatedly
// accumulates variety across the registry.
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { queueImmediateSearch } = await import('../src/core/jobs/boss');
  await db.execute(sql`UPDATE user_settings SET search_in_progress = false, updated_at = now()`);
  const [{ user_id }] = (await db.execute(sql`SELECT user_id FROM professional_profiles LIMIT 1`)).rows as any[];
  await queueImmediateSearch(user_id);
  console.log('Queued an ADDITIVE search (no delete) for', String(user_id).slice(0, 8));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
