import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  // Operating defaults: prepare applications and queue them for review (semi),
  // never auto-fire real submissions. Sensible thresholds + age window.
  await db.execute(sql`
    UPDATE user_settings SET
      global_automation_mode = 'semi',
      require_review_before_submit = true,
      min_score_to_generate_materials = 60,
      min_score_to_apply = 70,
      max_vacancy_age_days = GREATEST(max_vacancy_age_days, 30),
      search_cadence_hours = 6,
      updated_at = now()
  `);

  // Make sure the user has platform_settings enabling search on the 3 classic
  // platforms (the other 2 are searched by default by the worker).
  const us = (await db.execute(sql`
    SELECT user_id, global_automation_mode, min_score_to_generate_materials, min_score_to_apply,
           max_vacancy_age_days, search_cadence_hours FROM user_settings
  `)).rows;
  console.log('user_settings now:');
  for (const r of us as any[]) console.log(' ', JSON.stringify(r));

  const prof = (await db.execute(sql`SELECT target_roles FROM professional_profiles`)).rows;
  console.log('\ntargetRoles:', JSON.stringify((prof as any[])[0]?.target_roles));

  const reg = (await db.execute(sql`
    SELECT platform, count(*) FILTER (WHERE status='active')::int AS active FROM ats_boards GROUP BY platform ORDER BY active DESC
  `)).rows;
  console.log('\nactive boards by platform:', (reg as any[]).map((r) => `${r.platform}=${r.active}`).join(', '));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
