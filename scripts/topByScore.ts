import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const rows = (await db.execute(sql`
    SELECT title, company, platform, location, score, status
    FROM vacancies ORDER BY score DESC NULLS LAST LIMIT 20
  `)).rows as any[];
  console.log('Top vacancies by score:');
  for (const r of rows) {
    console.log(` [${String(r.score ?? '?').padStart(3)}] ${(r.status ?? '').padEnd(12)} ${(r.location ?? '?').slice(0, 40).padEnd(40)} | ${r.title?.slice(0, 40)}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
