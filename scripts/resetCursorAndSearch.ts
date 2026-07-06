import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { queueImmediateSearch } = await import('../src/core/jobs/boss');

  await db.execute(sql`UPDATE system_settings SET search_cursor_offset = 0 WHERE id = 1`);
  const [{ user_id }] = (await db.execute(sql`SELECT user_id FROM professional_profiles LIMIT 1`)).rows as any[];
  await queueImmediateSearch(user_id);
  console.log('Cursor reset to 0; immediate search queued for', String(user_id).slice(0, 8));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
