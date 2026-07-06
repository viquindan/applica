import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const prof = await db.execute(sql`SELECT user_id, target_roles, target_countries, target_seniority FROM professional_profiles`);
  for (const r of prof.rows as any[]) {
    console.log('profile', String(r.user_id).slice(0, 8));
    console.log(' roles:', JSON.stringify(r.target_roles));
    console.log(' countries:', JSON.stringify(r.target_countries));
    console.log(' seniority:', JSON.stringify(r.target_seniority));
  }
  const ss = await db.execute(sql`SELECT search_cursor_offset, last_platform FROM system_settings WHERE id=1`);
  console.log('cursor:', JSON.stringify(ss.rows[0]));
  const us = await db.execute(sql`SELECT max_vacancy_age_days, min_score_to_generate_materials FROM user_settings`);
  console.log('settings:', JSON.stringify(us.rows));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
