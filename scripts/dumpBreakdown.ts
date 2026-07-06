import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const r = (await db.execute(sql`SELECT title, location, score, score_breakdown FROM vacancies ORDER BY discovered_at DESC LIMIT 4`)).rows as any[];
  for (const v of r) {
    console.log(`${v.title} @ ${v.location} | score=${v.score}`);
    console.log(' breakdown:', JSON.stringify(v.score_breakdown));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
