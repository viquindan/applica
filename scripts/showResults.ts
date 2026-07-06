import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const counts = (await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE discovered_at > now() - interval '15 minutes')::int AS recent,
           count(*) FILTER (WHERE status='generating' OR status='pending_review')::int AS prepared
    FROM vacancies
  `)).rows[0] as any;
  console.log(`Vacancies: total=${counts.total} added<15min=${counts.recent} prepared(generating/review)=${counts.prepared}\n`);

  const top = await db.execute(sql`
    SELECT title, company, platform, location, score, status
    FROM vacancies
    WHERE discovered_at > now() - interval '20 minutes'
    ORDER BY score DESC NULLS LAST
    LIMIT 15
  `);
  console.log('Top recently-discovered vacancies (new grounded roles):');
  for (const r of top.rows as any[]) {
    console.log(` [${String(r.score ?? '?').padStart(3)}] ${r.title} @ ${r.company} (${r.platform}) - ${r.location ?? '?'} [${r.status}]`);
  }

  const byPlat = await db.execute(sql`
    SELECT platform, count(*)::int AS n FROM vacancies
    WHERE discovered_at > now() - interval '20 minutes' GROUP BY platform ORDER BY n DESC
  `);
  console.log('\nBy platform (last 20 min):', (byPlat.rows as any[]).map((r) => `${r.platform}=${r.n}`).join(', '));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
