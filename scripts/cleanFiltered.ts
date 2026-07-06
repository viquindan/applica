import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const before = (await db.execute(sql`SELECT count(*)::int AS n FROM vacancies WHERE status = 'filtered'`)).rows[0] as any;
  await db.execute(sql`DELETE FROM vacancies WHERE status = 'filtered'`);
  const total = (await db.execute(sql`SELECT count(*)::int AS n FROM vacancies`)).rows[0] as any;

  console.log(`Deleted ${before.n} filtered (below-threshold) vacancies.`);
  console.log(`Remaining vacancies: ${total.n}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
