import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

/** Foreground real-submission harness for debugging the auto-apply path.
 * Usage: npx tsx scripts/_submit.ts <appIdPrefix> (or platform name to pick first) */
async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('need app id prefix or platform'); process.exit(1); }
  if (process.argv[3] === 'dry') { delete process.env.ENABLE_REAL_SUBMISSIONS; console.log('** DRY MODE: will fill but not click Submit **'); }
  const { db } = await import('../src/db/client');
  const { sql, eq } = await import('drizzle-orm');
  const { applications, vacancies, professionalProfiles, users, resumes, coverLetters } = await import('../src/db/schema');
  const { runAutomatedApplication } = await import('../src/core/automation/applyEngine');
  const { resolveUploadPath } = await import('../src/core/tailoring/cvFile');
  const { GreenhouseAdapter } = await import('../src/core/platforms/greenhouse');
  const { LeverAdapter } = await import('../src/core/platforms/lever');
  const { AshbyAdapter } = await import('../src/core/platforms/ashby');
  const { SmartRecruitersAdapter } = await import('../src/core/platforms/smartrecruiters');
  const { RecruiteeAdapter } = await import('../src/core/platforms/recruitee');
  const adapters: any = {
    greenhouse: new GreenhouseAdapter(), lever: new LeverAdapter(), ashby: new AshbyAdapter(),
    smartrecruiters: new SmartRecruitersAdapter(), recruitee: new RecruiteeAdapter(),
  };

  const [row] = (await db.execute(sql`SELECT a.id FROM applications a JOIN vacancies v ON v.id=a.vacancy_id WHERE v.title LIKE '[TEST%' AND (a.id::text LIKE ${arg + '%'} OR v.platform=${arg}) ORDER BY v.title LIMIT 1`)).rows as any[];
  if (!row) { console.error('no test app for', arg); process.exit(1); }
  const applicationId = row.id;

  const [application] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
  const [[vacancy], [profile], [user]] = await Promise.all([
    db.select().from(vacancies).where(eq(vacancies.id, application.vacancyId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, application.userId)).limit(1),
    db.select().from(users).where(eq(users.id, application.userId)).limit(1),
  ]);
  const adapter = (adapters as any)[vacancy.platform];
  const adaptedResume = application.adaptedResumeId ? (await db.select().from(resumes).where(eq(resumes.id, application.adaptedResumeId)).limit(1))[0] : null;
  const baseResume = profile.baseResumeId ? (await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1))[0] : null;
  const resumeForUpload = adaptedResume?.filePath ? adaptedResume : baseResume;
  const coverLetter = application.coverLetterId ? (await db.select().from(coverLetters).where(eq(coverLetters.id, application.coverLetterId)).limit(1))[0] : null;

  console.log(`\n=== SUBMIT ${vacancy.platform} - ${vacancy.title} ===`);
  console.log('url:', vacancy.url);
  console.log('resume:', resumeForUpload?.filePath, '', resumeForUpload?.filePath ? resolveUploadPath(resumeForUpload.filePath) : 'NONE');
  console.log('answers:', JSON.stringify(application.formAnswers ?? {}, null, 0).slice(0, 800));

  const context = {
    applicationId,
    profileData: { firstName: user.name.split(' ')[0], lastName: user.name.split(' ').slice(1).join(' '), email: user.email, phone: user.phone, linkedin: user.linkedin, country: user.country, city: user.location, portfolio: user.portfolio },
    resumePath: resumeForUpload?.filePath ? resolveUploadPath(resumeForUpload.filePath) : '',
    coverLetterContent: coverLetter?.content,
    formAnswers: (application.formAnswers as Record<string, string>) ?? {},
    fillOnly: process.argv[3] === 'fillonly',
  };

  if (process.argv[3] === 'realauto') {
    const { runRealBrowserApply } = await import('../src/core/automation/assistedApply');
    console.log('** REAL BROWSER: abrirá TU Brave/Chrome, llenará e intentará ENVIAR de verdad (~90s) **');
    const outcome = await runRealBrowserApply(adapter, vacancy.url, context, { timeoutMs: 90000 });
    console.log('\n=== REALAUTO OUTCOME ===', JSON.stringify({ status: outcome.status, reason: outcome.reason, auto: (outcome as any).auto }, null, 0));
    process.exit(0);
  }

  if (process.argv[3] === 'assisted') {
    const { runAssistedApply } = await import('../src/core/automation/assistedApply');
    console.log('** ASSISTED: abrirá una ventana visible, llenará el formulario y esperará ~25s **');
    const outcome = await runAssistedApply(adapter, vacancy.url, context, { timeoutMs: 25000 });
    console.log('\n=== ASSISTED OUTCOME ===', JSON.stringify({ status: outcome.status, reason: outcome.reason }, null, 0));
    process.exit(0);
  }

  const result = await runAutomatedApplication(adapter, vacancy.url, context);
  console.log('\n=== RESULT ===');
  console.log('status:', result.status, '| submissionStatus:', result.submissionStatus, '| auto:', result.submittedAutomatically);
  console.log('failureReason:', result.failureReason);
  console.log('evidence:', result.evidencePath || result.screenshotPath);
  console.log('logs:', JSON.stringify(result.logs ?? [], null, 0).slice(0, 1500));
  process.exit(0);
}
main().catch((e) => { console.error('HARNESS ERR:', e?.stack || e?.message || e); process.exit(1); });
