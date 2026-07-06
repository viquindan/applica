import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { atsBoards, platformSettings, userSettings, vacancies } = await import('../src/db/schema');

  console.log('\n=== 1. REGISTRY FRESHNESS (is it being revalidated?) ===');
  const freshness = await db.execute(sql`
    SELECT platform,
           count(*)::int AS total,
           count(*) FILTER (WHERE status='active')::int AS active,
           count(*) FILTER (WHERE last_validated_at IS NULL)::int AS never_validated,
           count(*) FILTER (WHERE last_validated_at > now() - interval '24 hours')::int AS validated_24h,
           max(last_validated_at) AS most_recent_validation,
           coalesce(sum(last_seen_job_count),0)::int AS jobs_seen
    FROM ats_boards GROUP BY platform ORDER BY total DESC
  `);
  for (const r of freshness.rows as any[]) {
    console.log(` ${String(r.platform).padEnd(15)} total=${r.total} active=${r.active} neverValidated=${r.never_validated} validated<24h=${r.validated_24h} jobs=${r.jobs_seen}`);
    console.log(` most recent validation: ${r.most_recent_validation}`);
  }

  console.log('\n=== 2. PER-USER PLATFORM COVERAGE (which sources are actually searched?) ===');
  const ps = await db.execute(sql`
    SELECT user_id, platform_name, search_enabled, status
    FROM platform_settings ORDER BY user_id, platform_name
  `);
  const byUser: Record<string, string[]> = {};
  for (const r of ps.rows as any[]) {
    (byUser[r.user_id] ??= []).push(`${r.platform_name}${r.search_enabled ? '' : '(off)'}${r.status !== 'active' ? `[${r.status}]` : ''}`);
  }
  for (const [uid, plats] of Object.entries(byUser)) {
    console.log(` user ${uid.slice(0, 8)}: ${plats.join(', ')}`);
  }
  if (Object.keys(byUser).length === 0) console.log(' (no platform_settings rows at all!)');

  console.log('\n=== 3. SEARCH SCHEDULING (is it re-running periodically?) ===');
  const us = await db.execute(sql`
    SELECT user_id, last_search_at, next_search_at, search_cadence_hours, search_in_progress,
           last_search_status, last_search_result_count, last_search_source_count, last_search_scanned_source_count,
           last_search_prepared_count
    FROM user_settings
  `);
  for (const r of us.rows as any[]) {
    console.log(` user ${String(r.user_id).slice(0, 8)}: status=${r.last_search_status} inProgress=${r.search_in_progress} cadence=${r.search_cadence_hours}h`);
    console.log(` lastSearch=${r.last_search_at} nextSearch=${r.next_search_at}`);
    console.log(` lastResult: found=${r.last_search_result_count} sources=${r.last_search_source_count} scanned=${r.last_search_scanned_source_count} prepared=${r.last_search_prepared_count}`);
  }

  console.log('\n=== 4. ARE NEW VACANCIES BEING ADDED? (discoveredAt recency) ===');
  const vc = await db.execute(sql`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE discovered_at > now() - interval '24 hours')::int AS last_24h,
           count(*) FILTER (WHERE discovered_at > now() - interval '7 days')::int AS last_7d,
           max(discovered_at) AS most_recent
    FROM vacancies
  `);
  const v = (vc.rows as any[])[0];
  console.log(` total vacancies=${v.total} added<24h=${v.last_24h} added<7d=${v.last_7d}`);
  console.log(` most recent vacancy discovered: ${v.most_recent}`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
