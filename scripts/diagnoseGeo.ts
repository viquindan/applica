import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  console.log('=== User geo ===');
  const u = (await db.execute(sql`SELECT name, location, country FROM users LIMIT 1`)).rows[0] as any;
  console.log(JSON.stringify(u));

  const p = (await db.execute(sql`SELECT target_countries FROM professional_profiles LIMIT 1`)).rows[0] as any;
  console.log('targetCountries:', JSON.stringify(p?.target_countries));

  console.log('\n=== Last search results: locations of stored vacancies ===');
  const rows = (await db.execute(sql`
    SELECT location, score, status FROM vacancies
    ORDER BY discovered_at DESC LIMIT 40
  `)).rows as any[];
  console.log(`(${rows.length} most recent)`);
  for (const r of rows.slice(0, 25)) {
    console.log(` [${String(r.score ?? '?').padStart(3)}] ${r.status?.padEnd(14)} ${r.location ?? '?'}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
