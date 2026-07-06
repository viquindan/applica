import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  await db.execute(sql`UPDATE user_settings SET search_cadence_hours = 3, updated_at = now()`);
  const r = (await db.execute(sql`SELECT search_cadence_hours, next_search_at FROM user_settings`)).rows as any[];
  console.log('cadence:', r.map((x) => x.search_cadence_hours), '| nextSearch:', r.map((x) => x.next_search_at));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
