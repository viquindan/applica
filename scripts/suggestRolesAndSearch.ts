/**
 * Runs the new flow for the real user: analyze CV -> suggest realistic roles ->
 * register them as targetRoles -> trigger a search.
 *
 * Run: npx tsx scripts/suggestRolesAndSearch.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { eq } = await import('drizzle-orm');
  const { professionalProfiles, resumes } = await import('../src/db/schema');
  const { suggestTargetRoles } = await import('../src/core/profile/suggestRoles');
  const { queueImmediateSearch } = await import('../src/core/jobs/boss');

  const [profile] = await db.select().from(professionalProfiles).limit(1);
  if (!profile) { console.error('No profile found'); process.exit(1); }

  const [baseResume] = profile.baseResumeId
    ? await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1)
    : [null];

  console.log('CURRENT (aspirational) roles:');
  console.log(' ' + JSON.stringify(profile.targetRoles));
  console.log(baseResume?.textContent ? `\nResume text: ${baseResume.textContent.length} chars` : '\n(no base resume text - grounding on structured experience)');

  console.log('\nAnalyzing CV / experience and suggesting realistic roles...\n');
  const suggestions = await suggestTargetRoles({ profile, resumeText: baseResume?.textContent });

  console.log('SUGGESTED (CV-grounded) roles:');
  for (const s of suggestions) {
    console.log(` • ${s.title}${s.seniority ? ` [${s.seniority}]` : ''}`);
    if (s.rationale) console.log(` ${s.rationale}`);
  }

  const titles = suggestions.map((s) => s.title);
  if (titles.length) {
    await db.update(professionalProfiles)
      .set({ targetRoles: titles, updatedAt: new Date() })
      .where(eq(professionalProfiles.userId, profile.userId));
    console.log(`\nRegistered ${titles.length} suggested roles as targetRoles (user can edit later).`);
  }

  await queueImmediateSearch(profile.userId);
  console.log('\nQueued an immediate search for the user. The running worker will process it.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
