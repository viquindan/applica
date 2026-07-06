import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { eq, sql } = await import('drizzle-orm');
  const { professionalProfiles, resumes } = await import('../src/db/schema');
  const { suggestTargetRoles } = await import('../src/core/profile/suggestRoles');
  const { queueImmediateSearch } = await import('../src/core/jobs/boss');

  const [profile] = await db.select().from(professionalProfiles).limit(1);
  const [baseResume] = profile.baseResumeId
    ? await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1)
    : [null];

  const suggestions = await suggestTargetRoles({ profile, resumeText: baseResume?.textContent });
  const titles = suggestions.map((s) => s.title);
  console.log('New roles (English):');
  titles.forEach((t) => console.log(' •', t));

  if (titles.length) {
    await db.update(professionalProfiles).set({ targetRoles: titles, updatedAt: new Date() })
      .where(eq(professionalProfiles.userId, profile.userId));
  }
  await db.execute(sql`DELETE FROM vacancies`);
  await db.execute(sql`UPDATE system_settings SET search_cursor_offset = 0 WHERE id = 1`);
  await queueImmediateSearch(profile.userId);
  console.log('\nCleared vacancies, registered English roles, search queued.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
