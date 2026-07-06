import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { queueImmediateSearch } = await import('../src/core/jobs/boss');

  await db.execute(sql`UPDATE user_settings SET search_in_progress = false, updated_at = now()`);
  await db.execute(sql`DELETE FROM vacancies`);
  await db.execute(sql`UPDATE system_settings SET search_cursor_offset = 0 WHERE id = 1`);
  const [{ user_id }] = (await db.execute(sql`SELECT user_id FROM professional_profiles LIMIT 1`)).rows as any[];
  await queueImmediateSearch(user_id);
  console.log('Reset searchInProgress, cleared vacancies, queued ONE search for', String(user_id).slice(0, 8));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
