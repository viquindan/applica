import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { queueImmediateSearch } = await import('../src/core/jobs/boss');

  // Senior/exec roles are posted less often and stay open longer - 14 days is too tight.
  await db.execute(sql`UPDATE user_settings SET max_vacancy_age_days = 30 WHERE max_vacancy_age_days < 30`);
  await db.execute(sql`UPDATE system_settings SET search_cursor_offset = 0 WHERE id = 1`);
  const [{ user_id }] = (await db.execute(sql`SELECT user_id FROM professional_profiles LIMIT 1`)).rows as any[];
  await queueImmediateSearch(user_id);
  console.log('maxVacancyAgeDays=30, cursor reset, search queued for', String(user_id).slice(0, 8));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
