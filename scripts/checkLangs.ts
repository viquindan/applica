import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const r = await db.execute(sql`SELECT name, languages FROM users`);
  for (const row of r.rows as any[]) {
    console.log(row.name, '->', JSON.stringify(row.languages));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
