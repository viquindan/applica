import { loadEnvLocal } from '@/lib/loadEnvLocal';
loadEnvLocal();
import { getBoss, queueSearch, queueRegistryRefresh, queueBoardDiscovery, queueProcessApplication, queueJobCacheRefresh, queueReEvaluate } from './boss';
import { reEvaluateVacancies } from '../pipeline/reEvaluate';
import { db } from '@/db/client';
import {
  applications,
  applicationSubmissions,
  coverLetters,
  platformSettings,
  professionalProfiles,
  resumes,
  systemSettings,
  userSettings,
  users,
  vacancies,
} from '@/db/schema';
import { and, eq, gte, count } from 'drizzle-orm';
import { GreenhouseAdapter } from '../platforms/greenhouse';
import { LeverAdapter } from '../platforms/lever';
import { AshbyAdapter } from '../platforms/ashby';
import { SmartRecruitersAdapter } from '../platforms/smartrecruiters';
import { RecruiteeAdapter } from '../platforms/recruitee';
import { processVacancyForUser } from '../pipeline/processVacancy';
import { generateCoverLetter, tailorCV } from '../tailoring/cvTailor';
import { getInternalAiConfig } from '../ai/config';
import { getRelevantMemoryContext } from '../memory/memoryStore';
import { evaluateSubmission } from '../rule-engine/submissionDecision';
import { scrapeLinkedInRemoteLatAm } from '../automation/linkedinScraper';
import { getUserPlanLimits } from '../billing/planLimits';
import { searchAtsWeb } from '../platforms/atsAutoDiscovery';
import { getCurrentMonthApplicationCount } from '../billing/usageTracker';
import { DEFAULT_GREENHOUSE_BOARD_TOKENS, DEFAULT_GREENHOUSE_BOARDS } from '../platforms/greenhouseSources';
import { seedLeverBoards } from '../platforms/leverSources';
import { seedAshbyBoards } from '../platforms/ashbySources';
import { seedSmartRecruitersBoards } from '../platforms/smartRecruitersSources';
import { seedRecruiteeBoards } from '../platforms/recruiteeSources';
import { getActiveAtsBoardTokensBatch, getActiveBoardCount, refreshAtsBoardRegistry, getAtsRegistryMetrics, seedAtsBoards, growRegistryFromCompanies } from '../platforms/atsRegistry';
import { refreshJobCache, isJobCacheFresh, gatherSearchCandidates, jobCacheSize } from '../platforms/jobCache';
import { inspectApplicationForm, mergeDecisionWithPreview } from '../automation/formPreview';
import { autoAnswerFields } from '../automation/standardAnswers';
import { generateTailoredAnswers, isOpenEndedQuestion, DEFAULT_OPEN_QUESTIONS } from '../automation/tailoredAnswers';
import { runLinkedInEasyApply } from '../automation/linkedinApplyEngine';
import { getLinkedInStatus } from '../automation/linkedinSession';
import { detectPlatformFromUrl } from '../platforms/atsSearchHelpers';
import { scrapeGenericFormQuestions } from '../automation/genericFormScraper';
import { answerForLabel } from '../automation/standardAnswers';
import { renderCvToPdf, resolveUploadPath } from '../tailoring/cvFile';
import { formRequiresForeignWorkAuth } from '../scoring/eligibility';

const adapters = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
  smartrecruiters: new SmartRecruitersAdapter(),
  recruitee: new RecruiteeAdapter(),
};

async function getSearchCursorState() {
  let state = await db.select().from(systemSettings).where(eq(systemSettings.id, 1)).limit(1).then(r => r[0]);
  if (!state) {
    [state] = await db.insert(systemSettings).values({ id: 1 }).returning();
  }
  return state;
}

export async function startWorkers() {
  const boss = await getBoss();

  // Worker for "search_vacancies"
  await boss.work('search_vacancies', async (jobs: any) => {
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    const { userId } = job.data as { userId: string };
    console.log(`[Worker] Processing search for user ${userId}`);

    try {
      const [[user], [profile], [settings], userPlatforms] = await Promise.all([
        db.select().from(users).where(eq(users.id, userId)).limit(1),
        db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
        db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
        db.select().from(platformSettings).where(eq(platformSettings.userId, userId)),
      ]);
      if (settings?.searchInProgress) {
        console.log(`[Worker] Search already in progress for user ${userId}. Skipping duplicate.`);
        return { message: 'Search already in progress' };
      }
      await db.update(userSettings).set({
        searchInProgress: true,
        lastSearchStatus: 'running',
        lastSearchError: null,
        updatedAt: new Date(),
      }).where(eq(userSettings.userId, userId));
      // Search EVERY supported ATS platform by default. A user only skips a
      // platform if they have an explicit settings row that disables it - so
      // newly added platforms (e.g. smartrecruiters, recruitee) are searched
      // without requiring the user to pre-configure them.
      const settingByName = new Map(userPlatforms.map((p) => [p.platformName, p]));
      const activePlatforms = (Object.keys(adapters) as Array<keyof typeof adapters>)
        .filter((name) => {
          const ps = settingByName.get(name);
          if (!ps) return true;
          return ps.searchEnabled && ps.status === 'active';
        })
        .map((name) => ({
          platformName: name,
          notes: settingByName.get(name)?.notes ?? null,
          settingId: settingByName.get(name)?.id ?? null,
        }));

      if (activePlatforms.length === 0) {
        console.log(`[Worker] No active platforms for user ${userId}. Skipping.`);
        await db.update(userSettings).set({
          searchInProgress: false,
          lastSearchStatus: 'success',
          lastSearchError: 'No hay plataformas activas configuradas',
          lastSearchAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(userSettings.userId, userId));
        return { message: 'No active platforms' };
      }

      let totalFound = 0;
      let preparedCount = 0;
      let filteredCount = 0;

      const { getUserPlanLimits } = await import('../billing/planLimits');
      const { getCurrentMonthApplicationCount } = await import('../billing/usageTracker');
      const planLimits = await getUserPlanLimits(userId);
      const currentCount = await getCurrentMonthApplicationCount(userId);
      const context = { user, profile, settings, planLimits, currentCount };

      // Resolve a rotating cursor once per run so each platform paginates through
      // its own registry across successive searches.
      const cursorState = await getSearchCursorState();
      const cursorOffset = cursorState.searchCursorOffset ?? 0;

      const enabledNames = new Set<string>(activePlatforms.map((p) => p.platformName));
      const roles = profile?.targetRoles ?? [];
      const locations = profile?.targetCountries ?? [];
      const homeCountries = [user?.country, user?.location].filter((c): c is string => Boolean(c));
      const maxAgeDays = settings?.maxVacancyAgeDays ?? 14;

      // Build the candidate pool. Fast path: the shared cache (one central fetch
      // serves all users). Fallback: live per-platform fetch if the cache is cold.
      let vacancies: Awaited<ReturnType<typeof gatherSearchCandidates>> = [];
      if (isJobCacheFresh()) {
        const srTokens = enabledNames.has('smartrecruiters')
          ? await resolveBoardTokens('smartrecruiters', null, cursorOffset)
          : [];
        vacancies = await gatherSearchCandidates({ roles, locations, homeCountries, maxAgeDays, limit: 200, smartRecruitersTokens: srTokens });
        // Honor explicit per-user platform opt-outs against the shared pool.
        vacancies = vacancies.filter((v) => enabledNames.has(v.platform));
        console.log(`[Worker] Cache hit: ${jobCacheSize()} cached jobs -> ${vacancies.length} candidates for user ${userId}`);
      } else {
        console.log('[Worker] Job cache cold - falling back to live per-platform fetch.');
        for (const p of activePlatforms) {
          const adapter = adapters[p.platformName as keyof typeof adapters];
          if (!adapter) continue;
          const boardTokens = await resolveBoardTokens(p.platformName, p.notes, cursorOffset);
          const found = await adapter.search({ limit: 50, boardTokens, roles, locations, homeCountries, maxAgeDays });
          vacancies.push(...found);
        }
      }

      totalFound += vacancies.length;
      await db.update(userSettings).set({
        lastSearchResultCount: totalFound,
        lastSearchSourceCount: vacancies.length,
        lastSearchScannedSourceCount: vacancies.length,
        updatedAt: new Date(),
      }).where(eq(userSettings.userId, userId));

      let processedInLoop = 0;
      for (const vacancy of vacancies) {
        const result = await processVacancyForUser(userId, vacancy, context);
        if (result.applicationId) preparedCount += 1;
        else filteredCount += 1;

        processedInLoop++;
        if (processedInLoop % 10 === 0) {
          await db.update(userSettings).set({
            lastSearchFilteredCount: filteredCount,
            lastSearchPreparedCount: preparedCount,
            updatedAt: new Date(),
          }).where(eq(userSettings.userId, userId));
        }
      }

      // Advance the shared registry cursor once per run, resetting when it
      // overflows the largest platform registry so rotation wraps around.
      const maxBoardCount = Math.max(
        await getActiveBoardCount('greenhouse'),
        await getActiveBoardCount('lever'),
        await getActiveBoardCount('ashby'),
        await getActiveBoardCount('smartrecruiters'),
        await getActiveBoardCount('recruitee'),
      );
      const nextCursorOffset = cursorOffset + 100 >= maxBoardCount ? 0 : cursorOffset + 100;
      await db.update(systemSettings).set({
        searchCursorOffset: nextCursorOffset,
        updatedAt: new Date(),
      }).where(eq(systemSettings.id, 1));

      // Run LinkedIn Stealth Scraper
      console.log('[Worker] Launching LinkedIn Stealth Scraper...');
      // Search the candidate's own location FIRST (local roles hire local people),
      // then their broader target regions.
      const linkedinLocations = [...new Set([...homeCountries, ...locations])];
      const linkedinJobs = await scrapeLinkedInRemoteLatAm({
        roles: profile?.targetRoles ?? [],
        locations: linkedinLocations,
      });

      // Self-growing catalog: turn the companies LinkedIn surfaced into permanent
      // ATS sources (probe their boards across platforms). Fire-and-forget.
      growRegistryFromCompanies(linkedinJobs.map((j) => j.company).filter(Boolean))
        .then((r) => r.added > 0 && console.log(`[Worker] Registry grew from LinkedIn companies: +${r.added} new ATS board(s)`))
        .catch((e) => console.warn('[Worker] growRegistryFromCompanies failed:', (e as Error)?.message ?? e));

      // CONCURRENT WORKER CLUSTER (Limit: 5 workers)
      const pMap = (await import('p-map')).default;
      console.log(`[Worker] Processing ${linkedinJobs.length} LinkedIn jobs with concurrency limit 5`);

      await pMap(linkedinJobs, async (job) => {
        const result = await processVacancyForUser(userId, job, context);
        if (result.applicationId) preparedCount += 1;
        else filteredCount += 1;
      }, { concurrency: 5 });

      const now = new Date();
      const nextSearchAt = new Date(now.getTime() + (settings?.searchCadenceHours ?? 24) * 60 * 60 * 1000);
      await db.update(userSettings).set({
        lastSearchAt: now,
        nextSearchAt,
        lastSearchStatus: 'success',
        lastSearchResultCount: totalFound,
        lastSearchPreparedCount: preparedCount,
        lastSearchFilteredCount: filteredCount,
        lastSearchError: null,
        searchInProgress: false,
        updatedAt: now,
      }).where(eq(userSettings.userId, userId));
      await Promise.all(activePlatforms
        .filter((platform) => platform.settingId)
        .map((platform) =>
          db.update(platformSettings).set({
            lastRunAt: now,
            lastError: null,
            updatedAt: now,
          }).where(eq(platformSettings.id, platform.settingId as string)),
        ));
      await queueSearch(userId, nextSearchAt);
      return { success: true, totalFound, nextSearchAt };
    } catch (error: any) {
      console.error(`[Worker] Search failed for user ${userId}:`, error);
      const now = new Date();
      const [latestSettings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
      const nextSearchAt = new Date(now.getTime() + (latestSettings?.searchCadenceHours ?? 24) * 60 * 60 * 1000);
      await db.update(userSettings).set({
        lastSearchAt: now,
        nextSearchAt,
        lastSearchStatus: 'failed',
        lastSearchError: error.message ?? 'Unknown search failure',
        searchInProgress: false,
        updatedAt: now,
      }).where(eq(userSettings.userId, userId));
      await queueSearch(userId, nextSearchAt);
      throw error; // Will be retried by pg-boss
    }
  });

  // Worker for "process_application"
  await boss.work('process_application', async (jobs: any) => {
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    const { applicationId } = job.data as { applicationId: string };
    console.log(`[Worker] Processing application ${applicationId}`);

    const { runAutomatedApplication } = require('../automation/applyEngine');

    const failApplication = async (reason: string) => {
      const [submission] = await db.select().from(applicationSubmissions)
        .where(eq(applicationSubmissions.applicationId, applicationId)).limit(1);
      if (submission) {
        await db.update(applicationSubmissions).set({
          status: 'failed',
          submissionStatus: 'failed_precondition',
          failureReason: reason,
          logs: [
            ...(submission.logs ?? []),
            { level: 'error', message: reason, timestamp: new Date().toISOString() },
          ],
        }).where(eq(applicationSubmissions.id, submission.id));
      }
      await db.update(applications).set({
        status: 'failed',
        updatedAt: new Date(),
      }).where(eq(applications.id, applicationId));
      await db.update(systemSettings).set({
        updatedAt: new Date(),
      }).where(eq(systemSettings.id, 1));
      return { success: false, message: reason };
    };

    const [application] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!application) return { message: 'Application not found' };
    const [existingSubmission] = await db.select().from(applicationSubmissions)
      .where(eq(applicationSubmissions.applicationId, applicationId)).limit(1);
    if (existingSubmission?.status === 'submitted' || existingSubmission?.submissionStatus === 'success') {
      console.log(`[Worker] Application ${applicationId} already submitted. Skipping duplicate send.`);
      return { success: true, message: 'Application already submitted' };
    }

    const [[vacancy], [profile], [user]] = await Promise.all([
      db.select().from(vacancies).where(eq(vacancies.id, application.vacancyId)).limit(1),
      db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, application.userId)).limit(1),
      db.select().from(users).where(eq(users.id, application.userId)).limit(1),
    ]);
    if (!vacancy || !profile || !user) return failApplication('Missing application context');

    // ── LinkedIn: session-based Easy Apply engine (not an ATS adapter) ──
    if (vacancy.platform === 'linkedin') {
      const li = await getLinkedInStatus(application.userId);
      if (li.status !== 'connected') {
        await db.update(vacancies).set({
          warnings: [...(vacancy.warnings ?? []), 'Conecta tu LinkedIn para aplicar automáticamente.'],
          updatedAt: new Date(),
        }).where(eq(vacancies.id, vacancy.id));
        await db.update(applications).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(applications.id, applicationId));
        return { success: false, message: 'LinkedIn not connected' };
      }

      const adaptedR = application.adaptedResumeId
        ? (await db.select().from(resumes).where(eq(resumes.id, application.adaptedResumeId)).limit(1))[0] : null;
      const baseR = profile.baseResumeId
        ? (await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1))[0] : null;
      const resumePath = adaptedR?.filePath ?? baseR?.filePath ?? undefined;

      // Per-USER per-day LinkedIn volume cap to stay under the radar; force
      // dry-run if hit or if real submissions are globally disabled.
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [{ c: liToday }] = await db.select({ c: count() })
        .from(applicationSubmissions)
        .innerJoin(applications, eq(applicationSubmissions.applicationId, applications.id))
        .where(and(
          eq(applications.userId, application.userId),
          eq(applicationSubmissions.platform, 'linkedin'),
          eq(applicationSubmissions.status, 'submitted'),
          gte(applicationSubmissions.submissionTimestamp, dayAgo),
        ));
      const LINKEDIN_DAILY_CAP = Number(process.env.LINKEDIN_DAILY_CAP ?? 15);
      const realEnabled = process.env.ENABLE_REAL_SUBMISSIONS === 'true';
      const dryRun = !realEnabled || liToday >= LINKEDIN_DAILY_CAP;

      const result = await runLinkedInEasyApply({
        userId: application.userId,
        jobUrl: vacancy.url,
        evidenceId: applicationId,
        dryRun,
        profileData: {
          firstName: user.name.split(' ')[0],
          lastName: user.name.split(' ').slice(1).join(' '),
          email: user.email,
          phone: user.phone ?? undefined,
        },
        resumePath,
        formAnswers: (application.formAnswers as Record<string, string>) ?? {},
      });

      const baseSub = {
        applicationId, platform: 'linkedin', platformName: 'linkedin',
        mode: application.mode ?? 'semi',
        submittedAnswers: application.formAnswers,
        approvedByUser: true, approvalTimestamp: new Date(),
        screenshotPath: result.screenshotPath,
        logs: result.logs.map((m) => ({ level: 'info', message: m, timestamp: new Date().toISOString() })),
      };

      if (result.status === 'submitted') {
        await db.insert(applicationSubmissions).values({ ...baseSub, status: 'submitted', submissionStatus: 'success', submittedAutomatically: true, submissionTimestamp: new Date() } as any);
        await db.update(applications).set({ status: 'submitted', updatedAt: new Date() }).where(eq(applications.id, applicationId));
        await db.update(vacancies).set({ status: 'applied', updatedAt: new Date() }).where(eq(vacancies.id, vacancy.id));
        return { success: true, result };
      }
      if (result.status === 'dry_run') {
        await db.insert(applicationSubmissions).values({ ...baseSub, status: 'pending', submissionStatus: 'dry_run', submittedAutomatically: false } as any);
        await db.update(applications).set({ status: 'approved', updatedAt: new Date() }).where(eq(applications.id, applicationId));
        return { success: true, result };
      }

      // External "Apply" hand off to the matching ATS engine if we support it.
      if (result.status === 'external_apply' && result.externalUrl) {
        const plat = detectPlatformFromUrl(result.externalUrl);
        const extAdapter = plat ? (adapters as any)[plat] : undefined;
        const resumeUpload = adaptedR?.filePath ? adaptedR : baseR;
        if (extAdapter?.applyPlaywright && resumeUpload?.filePath) {
          console.log(`[Worker] LinkedIn external apply handing off to ${plat}: ${result.externalUrl}`);
          const coverLetter = application.coverLetterId
            ? (await db.select().from(coverLetters).where(eq(coverLetters.id, application.coverLetterId)).limit(1))[0] : null;
          const ats = await runAutomatedApplication(extAdapter, result.externalUrl, {
            applicationId,
            profileData: { firstName: user.name.split(' ')[0], lastName: user.name.split(' ').slice(1).join(' '), email: user.email, phone: user.phone, linkedin: user.linkedin },
            resumePath: resolveUploadPath(resumeUpload.filePath),
            coverLetterContent: coverLetter?.content,
            formAnswers: (application.formAnswers as Record<string, string>) ?? {},
          });
          const isSub = ats.status === 'submitted';
          const isDry = ats.submissionStatus === 'dry_run';
          await db.insert(applicationSubmissions).values({
            applicationId, platform: plat, platformName: plat, mode: application.mode ?? 'semi',
            status: ats.status ?? 'failed', submissionStatus: ats.submissionStatus,
            submittedAutomatically: ats.submittedAutomatically ?? isSub,
            submissionTimestamp: isSub ? new Date() : null,
            screenshotPath: ats.screenshotPath, evidencePath: ats.evidencePath, failureReason: ats.failureReason,
            submittedAnswers: application.formAnswers, approvedByUser: true, approvalTimestamp: new Date(),
            logs: ats.logs ?? [],
          } as any);
          await db.update(applications).set({ status: isSub ? 'submitted' : isDry ? 'approved' : 'pending_review', updatedAt: new Date() }).where(eq(applications.id, applicationId));
          await db.update(vacancies).set({ status: isSub ? 'applied' : 'pending_review', updatedAt: new Date() }).where(eq(vacancies.id, vacancy.id));
          return { success: isSub, handoff: plat, result: ats };
        }
        // Unknown/custom external site (or registration-gated like Workday): we
        // can't submit it, but we scrape its questions and draft answers so the
        // user can apply in seconds with everything ready.
        let preparedCount = 0;
        try {
          const questions = await scrapeGenericFormQuestions(result.externalUrl);
          if (questions.length) {
            const factual: Record<string, string> = {};
            const openQ: string[] = [];
            for (const q of questions) {
              const a = answerForLabel(q, user, profile);
              if (a) factual[q] = a; else openQ.push(q);
            }
            const aiCfg = getInternalAiConfig();
            const aiAns = openQ.length && aiCfg
              ? await generateTailoredAnswers(openQ.slice(0, 8), { user, profile, cvText: baseR?.textContent ?? undefined }, {
                  id: vacancy.id, platform: vacancy.platform, title: vacancy.title, company: vacancy.company,
                  location: vacancy.location ?? undefined, description: vacancy.description ?? '',
                  requirements: vacancy.requirements ?? undefined, url: vacancy.url,
                } as any, aiCfg)
              : {};
            const merged = { ...((application.formAnswers as Record<string, string>) ?? {}), ...factual, ...aiAns };
            preparedCount = Object.keys({ ...factual, ...aiAns }).length;
            await db.update(applications).set({ formAnswers: merged, updatedAt: new Date() }).where(eq(applications.id, applicationId));
          }
        } catch (e) {
          console.warn('[Worker] generic form scrape failed:', (e as Error)?.message ?? e);
        }
        const needsRegistration = /myworkdayjobs|workday|icims|taleo|brassring/i.test(result.externalUrl);
        const warnMsg = needsRegistration
          ? `Requiere registro en su sitio (${plat ?? 'externo'}). Te preparamos ${preparedCount} respuesta(s); regístrate y aplica desde: ${result.externalUrl}`
          : `Aplicación externa - preparamos ${preparedCount} respuesta(s) para que apliques en segundos desde: ${result.externalUrl}`;
        await db.update(vacancies).set({ warnings: [...(vacancy.warnings ?? []), warnMsg], updatedAt: new Date() }).where(eq(vacancies.id, vacancy.id));
        await db.update(applications).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(applications.id, applicationId));
        return { success: false, message: 'external_apply_prepared', externalUrl: result.externalUrl, prepared: preparedCount };
      }

      const warn = result.status === 'needs_review'
        ? `Easy Apply: faltan respuestas a - ${(result.unanswered ?? []).slice(0, 4).join('; ')}`
        : result.status === 'session_invalid' ? 'Tu sesión de LinkedIn expiró - reconéctala.'
        : result.status === 'checkpoint' ? 'LinkedIn pidió una verificación de seguridad. Abre LinkedIn, resuélvela y reintenta.'
        : result.status === 'not_easy_apply' ? 'Esta oferta no usa Easy Apply - aplica manualmente desde el enlace.'
        : 'No pudimos completar el Easy Apply automáticamente.';
      await db.update(vacancies).set({ warnings: [...(vacancy.warnings ?? []), warn], updatedAt: new Date() }).where(eq(vacancies.id, vacancy.id));
      await db.update(applications).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(applications.id, applicationId));
      return { success: false, message: result.status, result };
    }

    const adapter = adapters[vacancy.platform as keyof typeof adapters];
    if (!adapter) return failApplication(`No adapter for platform ${vacancy.platform}`);

    const adaptedResume = application.adaptedResumeId
      ? (await db.select().from(resumes).where(eq(resumes.id, application.adaptedResumeId)).limit(1))[0]
      : null;
    const baseResume = profile.baseResumeId
      ? (await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1))[0]
      : null;
    const resumeForUpload = adaptedResume?.filePath ? adaptedResume : baseResume;
    if (!resumeForUpload?.filePath) return failApplication('No uploadable resume file available');

    const coverLetter = application.coverLetterId
      ? (await db.select().from(coverLetters).where(eq(coverLetters.id, application.coverLetterId)).limit(1))[0]
      : null;

    const context = {
      applicationId,
      profileData: {
        firstName: user.name.split(' ')[0],
        lastName: user.name.split(' ').slice(1).join(' '),
        email: user.email,
        phone: user.phone,
        linkedin: user.linkedin,
      },
      resumePath: resolveUploadPath(resumeForUpload.filePath),
      coverLetterContent: coverLetter?.content,
      formAnswers: application.formAnswers ?? {},
    };

    console.log('[Worker] Delegating to Playwright ApplyEngine...');
    try {
      const result = await runAutomatedApplication(adapter, vacancy.url, context);
      const [submission] = await db.select().from(applicationSubmissions)
        .where(eq(applicationSubmissions.applicationId, applicationId)).limit(1);
      if (submission) {
        await db.update(applicationSubmissions).set({
          platform: vacancy.platform,
          platformName: vacancy.platform,
          status: result.status ?? 'failed',
          mode: application.mode ?? 'semi',
          submittedResumeId: resumeForUpload.id,
          submittedCoverLetterId: coverLetter?.id,
          submittedAnswers: application.formAnswers,
          submittedAutomatically: result.submittedAutomatically ?? false,
          submissionTimestamp: result.status === 'submitted' ? new Date() : null,
          submissionStatus: result.submissionStatus,
          failureReason: result.failureReason,
          screenshotPath: result.screenshotPath,
          evidencePath: result.evidencePath,
          logs: result.logs ?? [],
        }).where(eq(applicationSubmissions.id, submission.id));
      }
      const isSubmitted = result.status === 'submitted';
      const isDryRun = result.submissionStatus === 'dry_run';
      // Captcha-gated boards: the form is fully prepared but the site requires a
      // human verification (reCAPTCHA) we don't bypass. Route to assisted-manual
      // (pending_review + a clear note) instead of marking it a failure.
      const isAssistedCaptcha = result.submissionStatus === 'failed_captcha';
      if (isAssistedCaptcha) {
        await Promise.all([
          db.update(applications).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(applications.id, applicationId)),
          db.update(vacancies).set({
            status: 'pending_review',
            warnings: [...(vacancy.warnings ?? []), result.failureReason ?? 'Listo para aplicar: esta empresa exige verificación humana (reCAPTCHA). Abre la oferta y da el último clic - Applica ya preparó todo.'],
            updatedAt: new Date(),
          }).where(eq(vacancies.id, vacancy.id)),
        ]);
      } else {
        await Promise.all([
          db.update(applications).set({
            status: isSubmitted ? 'submitted' : isDryRun ? 'approved' : 'failed',
            updatedAt: new Date(),
          }).where(eq(applications.id, applicationId)),
          db.update(vacancies).set({
            status: isSubmitted ? 'applied' : 'pending_review',
            updatedAt: new Date(),
          }).where(eq(vacancies.id, vacancy.id)),
        ]);
      }

      console.log('[Worker] Playwright ApplyEngine result:', result);
      return { success: true, result };
    } catch (e: any) {
      console.error('[Worker] Playwright Engine failed:', e.message);
      throw e;
    }
  });

  // In-memory guard: one assisted window per application at a time (prevents
  // double-windows without a pg-boss singleton that would block legitimate retries).
  const activeAssisted = new Set<string>();

  // Assisted apply: open a VISIBLE browser on the user's machine with the form
  // pre-filled, and let the user finish (CAPTCHA + submit). We watch the window.
  await boss.work('assisted_apply', async (jobs: any) => {
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    const { applicationId } = job.data as { applicationId: string };
    console.log(`[Worker] Assisted apply for application ${applicationId}`);

    // Never leave the app stuck on "opening…": always resolve its status.
    const resetToReview = async (note?: string) => {
      const [v] = await db.select().from(vacancies).where(eq(vacancies.id, (await db.select({ vid: applications.vacancyId }).from(applications).where(eq(applications.id, applicationId)).limit(1))[0]?.vid)).limit(1);
      await db.update(applications).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(applications.id, applicationId));
      if (v) await db.update(vacancies).set({ status: 'pending_review', warnings: note ? [...(v.warnings ?? []), note] : (v.warnings ?? []), updatedAt: new Date() }).where(eq(vacancies.id, v.id));
    };

    if (activeAssisted.has(applicationId)) {
      console.log(`[Worker] Assisted window already open for ${applicationId} - skipping duplicate.`);
      return { success: true, skipped: 'already_open' };
    }
    activeAssisted.add(applicationId);

    try {
      const { runAssistedApply, runRealBrowserApply } = require('../automation/assistedApply');
      const [application] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
      if (!application) return { message: 'Application not found' };
      const [[vacancy], [profile], [user]] = await Promise.all([
        db.select().from(vacancies).where(eq(vacancies.id, application.vacancyId)).limit(1),
        db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, application.userId)).limit(1),
        db.select().from(users).where(eq(users.id, application.userId)).limit(1),
      ]);
      if (!vacancy || !profile || !user) { await resetToReview(); return { message: 'Missing context' }; }
      const adapter = adapters[vacancy.platform as keyof typeof adapters];
      if (!adapter) { await resetToReview(); return { message: `No adapter for ${vacancy.platform}` }; }

      // Closed postings don't 404 on ATS: Greenhouse redirects them to the
      // company's careers page, which strands the user on a page we can't fill.
      // Cheap server-side check before opening a window; fails open (ambiguous
      // or network error = alive) so it never blocks a real apply.
      const { checkVacancyUrlGone } = require('../automation/urlLiveness');
      const liveness = await checkVacancyUrlGone(vacancy.url);
      if (liveness.gone) {
        console.log(`[Worker] Vacancy gone (${liveness.reason}, ${liveness.status}) -> ${liveness.finalUrl}. Archiving.`);
        await db.update(applications).set({ status: 'skipped', updatedAt: new Date() }).where(eq(applications.id, applicationId));
        await db.update(vacancies).set({
          status: 'archived',
          warnings: [...(vacancy.warnings ?? []), 'La vacante ya no está publicada (la empresa la cerró). La archivamos para que no pierdas tiempo con ella.'],
          updatedAt: new Date(),
        }).where(eq(vacancies.id, vacancy.id));
        return { success: true, outcome: 'vacancy_gone' };
      }

      const adaptedResume = application.adaptedResumeId
        ? (await db.select().from(resumes).where(eq(resumes.id, application.adaptedResumeId)).limit(1))[0] : null;
      const baseResume = profile.baseResumeId
        ? (await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1))[0] : null;
      const resumeForUpload = adaptedResume?.filePath ? adaptedResume : baseResume;
      const coverLetter = application.coverLetterId
        ? (await db.select().from(coverLetters).where(eq(coverLetters.id, application.coverLetterId)).limit(1))[0] : null;

      // Merge the LATEST answer bank at apply time, so answers learned from earlier
      // applications pre-fill this one (the app's stored answers were fixed at prep
      // time and wouldn't include anything learned since). App-specific answers win.
      const { getReusableAnswersMap } = require('../memory/memoryStore');
      const bank = (await getReusableAnswersMap(application.userId)) as Record<string, string>;
      const mergedAnswers = { ...bank, ...((application.formAnswers as Record<string, string>) ?? {}) };

      const applyCtx = {
        applicationId,
        profileData: {
          firstName: user.name.split(' ')[0],
          lastName: user.name.split(' ').slice(1).join(' '),
          email: user.email, phone: user.phone, linkedin: user.linkedin,
          country: user.country, city: user.location, portfolio: user.portfolio,
        },
        resumePath: resumeForUpload?.filePath ? resolveUploadPath(resumeForUpload.filePath) : '',
        coverLetterContent: coverLetter?.content,
        formAnswers: mergedAnswers,
      };
      // Prefer the user's REAL browser (trusted fingerprint invisible captchas may
      // pass silently for a true auto-submit; also uses the real GPU). Falls back to
      // the bundled headful browser (pre-fill only) if no local browser is found.
      let outcome = await runRealBrowserApply(adapter, vacancy.url, applyCtx);
      // Fall back to the bundled headful browser ONLY if the real browser couldn't
      // be LAUNCHED (not installed, or "opens in the existing session" and
      // Playwright loses control). An error INSIDE the real browser (adapter
      // timeout etc.) must NOT fall back: the bundled Chromium has none of the
      // user's sessions and no trusted fingerprint, which defeats the whole flow -
      // better to reset to pending_review and let the user retry in THEIR browser.
      if (outcome.status === 'error' && (outcome.reason === 'no_local_browser' || String(outcome.reason ?? '').startsWith('launch_failed'))) {
        console.log(`[Worker] Real browser unavailable (${outcome.reason}) - falling back to bundled headful.`);
        outcome = await runAssistedApply(adapter, vacancy.url, applyCtx);
      }

      // Silent learning: save answers the user filled in the window to their bank
      // (new ones only), so future applications pre-fill them automatically.
      if (outcome.capturedAnswers && Object.keys(outcome.capturedAnswers).length) {
        const { captureReusableAnswer } = require('../memory/memoryStore');
        const existing = (application.formAnswers as Record<string, string>) ?? {};
        const merged = { ...existing };
        let learned = 0;
        for (const [q, a] of Object.entries(outcome.capturedAnswers as Record<string, string>)) {
          if (!existing[q] && a) { merged[q] = a; learned++; await captureReusableAnswer(application.userId, q, a).catch(() => {}); }
        }
        if (learned) {
          await db.update(applications).set({ formAnswers: merged, updatedAt: new Date() }).where(eq(applications.id, applicationId));
          console.log(`[Worker] Silent learning: guardé ${learned} respuesta(s) nueva(s) al banco.`);
        }
      }

      // If the user already resolved this app from the UI ("Ya envié" → submitted, or
      // "No se envió" → pending_review) while we were watching, don't overwrite it.
      const [cur] = await db.select({ status: applications.status }).from(applications).where(eq(applications.id, applicationId)).limit(1);
      if (cur && cur.status !== 'approved') {
        console.log(`[Worker] Usuario ya resolvió la app (${cur.status}) - no sobreescribo.`);
        return { success: true, outcome: outcome.status, userResolved: true };
      }

      if (outcome.status === 'submitted') {
        const [sub] = await db.select().from(applicationSubmissions).where(eq(applicationSubmissions.applicationId, applicationId)).limit(1);
        const subValues = {
          platform: vacancy.platform, platformName: vacancy.platform, status: 'submitted' as const,
          submissionStatus: 'success', submittedAutomatically: false, approvedByUser: true,
          approvalTimestamp: new Date(), submissionTimestamp: new Date(),
          screenshotPath: outcome.screenshotPath, logs: outcome.logs ?? [],
        };
        if (sub) await db.update(applicationSubmissions).set(subValues as any).where(eq(applicationSubmissions.id, sub.id));
        else await db.insert(applicationSubmissions).values({ applicationId, ...subValues } as any);
        await db.update(applications).set({ status: 'submitted', updatedAt: new Date() }).where(eq(applications.id, applicationId));
        await db.update(vacancies).set({ status: 'applied', updatedAt: new Date() }).where(eq(vacancies.id, vacancy.id));
        return { success: true, outcome: outcome.status };
      }

      // Not submitted. Give a specific note if the site blocked us (e.g. its own
      // application limit); otherwise the generic "we opened it, confirm if you sent".
      const note = outcome.reason === 'site_limit'
        ? 'La empresa alcanzó su límite de aplicaciones (política de ellos, no nuestra). Intenta más tarde o con otra vacante.'
        : 'Abrimos la oferta con tu formulario lleno. Si ya la enviaste, márcala como "Ya apliqué".';
      await resetToReview(note);
      return { success: true, outcome: outcome.status };
    } catch (e: any) {
      console.error('[Worker] Assisted apply failed:', e?.message ?? e);
      await resetToReview('No pudimos abrir la ventana esta vez. Reintenta con "Abrir y aplicar".').catch(() => {});
      return { success: false, error: e?.message ?? String(e) };
    } finally {
      activeAssisted.delete(applicationId);
    }
  });

  await boss.work('prepare_application_materials', async (jobs: any) => {
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    const { applicationId } = job.data as { applicationId: string };
    console.log(`[Worker] Preparing materials for application ${applicationId}`);

    const [application] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!application) return { message: 'Application not found' };

    const [[vacancy], [profile], [settings], [user]] = await Promise.all([
      db.select().from(vacancies).where(eq(vacancies.id, application.vacancyId)).limit(1),
      db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, application.userId)).limit(1),
      db.select().from(userSettings).where(eq(userSettings.userId, application.userId)).limit(1),
      db.select().from(users).where(eq(users.id, application.userId)).limit(1),
    ]);
    if (!vacancy || !profile || !settings || !user) return { message: 'Missing preparation context' };
    const [platform] = await db.select().from(platformSettings)
      .where(and(
        eq(platformSettings.userId, application.userId),
        eq(platformSettings.platformName, vacancy.platform),
      ))
      .limit(1);
    const [baseResume] = profile.baseResumeId
      ? await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1)
      : [null];

    const normalizedVacancy = {
      id: vacancy.id,
      platform: vacancy.platform,
      externalId: vacancy.externalId ?? undefined,
      title: vacancy.title,
      company: vacancy.company,
      location: vacancy.location ?? undefined,
      modality: vacancy.modality ?? undefined,
      salaryMin: vacancy.salaryMin ?? undefined,
      salaryMax: vacancy.salaryMax ?? undefined,
      salaryCurrency: vacancy.salaryCurrency ?? undefined,
      description: vacancy.description ?? '',
      requirements: vacancy.requirements ?? undefined,
      url: vacancy.url,
      postedAt: vacancy.postedAt ?? undefined,
    };

    let adaptedResumeId: string | null = null;
    let coverLetterId: string | null = null;
    let resumeChanges: unknown[] = [];
    let truthfulnessCheckPassed = true;
    const ai = getInternalAiConfig();

    try {
      if (baseResume?.textContent && ai) {
        const memoryContext = await getRelevantMemoryContext(application.userId, normalizedVacancy);
        const tailored = await tailorCV(
          baseResume.textContent,
          normalizedVacancy,
          settings.defaultTailoringLevel ?? 'medium',
          profile.cvTone ?? 'professional',
          ai,
          memoryContext,
        );
        const [adaptedResume] = await db.insert(resumes).values({
          userId: application.userId,
          label: `${baseResume.label} - ${vacancy.company}`,
          textContent: tailored.tailoredCV,
          version: (baseResume.version ?? 1) + 1,
          isBase: false,
        }).returning();
        adaptedResumeId = adaptedResume.id;
        resumeChanges = tailored.changes;
        truthfulnessCheckPassed = tailored.passed;

        // Render the tailored CV into a real, uploadable PDF (ATS forms need a
        // file, not text). Falls back to the base CV file if rendering fails.
        try {
          const pdfPath = await renderCvToPdf(tailored.tailoredCV, `cv_${application.id}`);
          await db.update(resumes).set({ filePath: pdfPath }).where(eq(resumes.id, adaptedResume.id));
        } catch (e) {
          console.warn('[Worker] Adapted CV PDF render failed; will fall back to base CV file:', (e as Error)?.message ?? e);
        }

        const letter = await generateCoverLetter(
          tailored.tailoredCV,
          normalizedVacancy,
          profile.coverLetterTone ?? 'professional',
          profile.achievements ?? '',
          ai,
          memoryContext,
        );
        const [coverLetter] = await db.insert(coverLetters).values({
          userId: application.userId,
          content: letter,
          version: 1,
        }).returning();
        coverLetterId = coverLetter.id;
      }
    } catch (error: any) {
      console.warn(`[Worker] Material preparation failed for application ${applicationId}: ${error?.message ?? error}`);
      truthfulnessCheckPassed = false;
      await db.update(vacancies).set({
        warnings: [...(vacancy.warnings ?? []), 'No pudimos preparar el CV/carta a medida en este intento. Puedes regenerarlos o aplicar con tu CV base.'],
        updatedAt: new Date(),
      }).where(eq(vacancies.id, vacancy.id));
    }

    const adapter = adapters[vacancy.platform as keyof typeof adapters];
    // Form inspection launches a real browser and parses a third-party form; on
    // JS-heavy ATSs (Ashby) it can throw or time out. A failure here must NOT
    // abort the whole prep (which leaves the app stuck in 'draft' and makes
    // pg-boss retry forever) - degrade to no preview so the app still completes
    // to pending_review with default prepared answers and the user can apply.
    let formPreview: Awaited<ReturnType<typeof inspectApplicationForm>> | null = null;
    if (adapter) {
      try {
        formPreview = await inspectApplicationForm(adapter, vacancy.url, {
          profileData: {
            firstName: user.name.split(' ')[0],
            lastName: user.name.split(' ').slice(1).join(' '),
            email: user.email,
            phone: user.phone,
            linkedin: user.linkedin,
          },
          formAnswers: application.formAnswers ?? {},
          hasResume: !!baseResume?.filePath,
        });
      } catch (error: any) {
        console.warn(`[Worker] Form inspection failed for ${vacancy.platform} application ${applicationId}: ${error?.message ?? error}`);
      }
    }

    // Auto-answer common factual questions (relocation, notice period, years of
    // experience…) so they don't force a manual-review pause. Sensitive topics
    // (visa, salary, demographics) intentionally stay unanswered and keep pausing.
    const unknownRequired = (formPreview?.fields ?? [])
      .filter((field) => field.source === 'unknown' && field.required)
      .map((field) => field.label);
    const { answers: derivedAnswers, unanswered: stillUnknownRequired } = autoAnswerFields(unknownRequired, user, profile);
    if (Object.keys(derivedAnswers).length) {
      const mergedAnswers = { ...(application.formAnswers ?? {}), ...derivedAnswers };
      await db.update(applications).set({ formAnswers: mergedAnswers, updatedAt: new Date() })
        .where(eq(applications.id, application.id));
      application.formAnswers = mergedAnswers;
      console.log(`[Worker] Auto-answered ${Object.keys(derivedAnswers).length} standard field(s); ${stillUnknownRequired.length} still need review.`);
    }
    // AI-personalized answers for OPEN-ENDED questions ("describe your experience
    // in X", "why this role?"). Tailored to the candidate's real background + what
    // the vacancy asks, so they're ready to submit (auto) or download (manual).
    const detectedOpenQuestions = (formPreview?.fields ?? [])
      .filter((field) => isOpenEndedQuestion(field) && field.status !== 'ready')
      .map((field) => field.label);
    // LinkedIn (and any form we couldn't inspect) gets a tailored default set so
    // the user always has prepared, role-specific answers to copy in.
    const openQuestions = detectedOpenQuestions.length > 0
      ? detectedOpenQuestions
      : (vacancy.platform === 'linkedin' || !formPreview) ? DEFAULT_OPEN_QUESTIONS : [];
    // Don't regenerate answers the user already has.
    const questionsToAnswer = openQuestions.filter((q) => !(application.formAnswers ?? {})[q]);
    if (questionsToAnswer.length && ai) {
      const tailored = await generateTailoredAnswers(
        questionsToAnswer,
        { user, profile, cvText: baseResume?.textContent ?? undefined },
        normalizedVacancy,
        ai,
      );
      if (Object.keys(tailored).length) {
        const mergedAnswers = { ...(application.formAnswers ?? {}), ...tailored };
        await db.update(applications).set({ formAnswers: mergedAnswers, updatedAt: new Date() })
          .where(eq(applications.id, application.id));
        application.formAnswers = mergedAnswers;
        console.log(`[Worker] AI-personalized ${Object.keys(tailored).length} open-ended answer(s).`);
      }
    }

    // Drop blockers for fields we just answered so they don't count as missing.
    const allAnswered = application.formAnswers ?? {};
    const remainingBlockers = (formPreview?.blockers ?? []).filter(
      (blocker) => !Object.keys(allAnswered).some((label) => blocker.includes(label)),
    );
    if (formPreview) formPreview.blockers = remainingBlockers;

    // Form-level disqualifier: if the application form itself requires work
    // authorization the candidate can't have (e.g. "authorized to work in the
    // US?"), this role isn't reachable - cap its score so it drops out of the
    // recommendations even though the description looked clean.
    const allFormQuestions = [...(formPreview?.blockers ?? []), ...((formPreview?.fields ?? []).map((f: any) => f.label))];
    if (formRequiresForeignWorkAuth(allFormQuestions, user.country || user.location)) {
      await db.update(vacancies).set({
        score: Math.min(vacancy.score ?? 100, 40),
        redFlags: [...(vacancy.redFlags ?? []), 'El formulario exige autorización para trabajar en EE. UU. - no elegible para ti.'],
        updatedAt: new Date(),
      }).where(eq(vacancies.id, vacancy.id));
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [[dailyResult], [weeklyResult]] = await Promise.all([
      db.select({ count: count() }).from(applications)
        .where(and(
          eq(applications.userId, application.userId),
          eq(applications.status, 'submitted'),
          gte(applications.updatedAt, dayAgo),
        )),
      db.select({ count: count() }).from(applications)
        .where(and(
          eq(applications.userId, application.userId),
          eq(applications.status, 'submitted'),
          gte(applications.updatedAt, weekAgo),
        )),
    ]);

    const decision = evaluateSubmission({
      applicationId,
      score: vacancy.score ?? 0,
      platformName: vacancy.platform,
      globalSettings: settings,
      platformSettings: platform,
      hasMissingFields: !baseResume?.textContent || remainingBlockers.length > 0,
      hasSalaryAmbiguity: formPreview?.fields.some((field) => /salary|compensation|expected pay/i.test(field.label)) ?? false,
      hasImmigrationAmbiguity: formPreview?.fields.some((field) => /visa|sponsorship|work authorization/i.test(field.label)) ?? false,
      hasCustomQuestions: stillUnknownRequired.length > 0,
      hasCaptcha: formPreview?.captchaDetected ?? false,
      hasLoginWall: false,
      truthfulnessCheckPassed,
      dailyCount: dailyResult.count,
      weeklyCount: weeklyResult.count,
      redFlags: vacancy.redFlags ?? [],
    });

    const isAutoSubmit = decision.nextAction === 'auto_submit';
    const nextVacancyStatus =
      decision.nextAction === 'skip'
        ? 'filtered'
        : isAutoSubmit
          ? 'applying'
          : 'pending_review';
    const nextApplicationStatus =
      decision.nextAction === 'skip' ? 'skipped' : isAutoSubmit ? 'approved' : 'pending_review';

    await Promise.all([
      db.update(applications).set({
        status: nextApplicationStatus,
        adaptedResumeId,
        coverLetterId,
        resumeChanges,
        submissionDecision: formPreview ? mergeDecisionWithPreview(decision, formPreview) : decision,
        updatedAt: new Date(),
      }).where(eq(applications.id, application.id)),
      db.update(vacancies).set({
        status: nextVacancyStatus,
        updatedAt: new Date(),
      }).where(eq(vacancies.id, vacancy.id)),
    ]);

    // Full-automation path: the rule engine cleared every gating rule, so enqueue
    // the real submission exactly like the manual "approve" route does. The
    // process_application worker requires a submission row to record its result.
    if (isAutoSubmit) {
      const [existingSubmission] = await db.select().from(applicationSubmissions)
        .where(eq(applicationSubmissions.applicationId, application.id)).limit(1);
      if (!existingSubmission) {
        await db.insert(applicationSubmissions).values({
          applicationId: application.id,
          platform: 'pending',
          platformName: 'pending',
          status: 'pending',
          mode: 'auto',
          submittedAutomatically: true,
          approvedByUser: false,
          logs: [{ level: 'info', message: 'Auto-aprobado por el motor de reglas (modo automático)', timestamp: new Date().toISOString() }],
        });
      }
      await queueProcessApplication(application.id);
    }

    return { success: true, applicationId };
  });

  await boss.work('regenerate_materials', async (jobs: any) => {
    const job = Array.isArray(jobs) ? jobs[0] : jobs;
    const { applicationId, kind } = job.data as { applicationId: string; kind: 'cv' | 'letter' };

    const [application] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!application) return { message: 'Application not found' };

    const [[vacancy], [profile], [settings]] = await Promise.all([
      db.select().from(vacancies).where(eq(vacancies.id, application.vacancyId)).limit(1),
      db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, application.userId)).limit(1),
      db.select().from(userSettings).where(eq(userSettings.userId, application.userId)).limit(1),
    ]);
    const ai = getInternalAiConfig();
    if (!vacancy || !profile || !settings || !ai) return { message: 'Missing data for regeneration' };

    const [baseResume] = profile.baseResumeId
      ? await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1)
      : [null];
    if (!baseResume?.textContent) return { message: 'Missing base resume' };

    const normalizedVacancy = {
      id: vacancy.id,
      platform: vacancy.platform,
      externalId: vacancy.externalId ?? undefined,
      title: vacancy.title,
      company: vacancy.company,
      location: vacancy.location ?? undefined,
      modality: vacancy.modality ?? undefined,
      salaryMin: vacancy.salaryMin ?? undefined,
      salaryMax: vacancy.salaryMax ?? undefined,
      salaryCurrency: vacancy.salaryCurrency ?? undefined,
      description: vacancy.description ?? '',
      requirements: vacancy.requirements ?? undefined,
      url: vacancy.url,
      postedAt: vacancy.postedAt ?? undefined,
    };
    const memoryContext = await getRelevantMemoryContext(application.userId, normalizedVacancy);
    if (kind === 'cv') {
      const tailored = await tailorCV(
        baseResume.textContent,
        normalizedVacancy,
        settings.defaultTailoringLevel ?? 'medium',
        profile.cvTone ?? 'professional',
        ai,
        memoryContext,
      );
      const [resume] = await db.insert(resumes).values({
        userId: application.userId,
        label: `${baseResume.label} - ${vacancy.company}`,
        textContent: tailored.tailoredCV,
        version: (baseResume.version ?? 1) + 1,
        isBase: false,
      }).returning();
      await db.update(applications).set({
        adaptedResumeId: resume.id,
        resumeChanges: tailored.changes,
        status: 'pending_review',
        updatedAt: new Date(),
      }).where(eq(applications.id, applicationId));
    }

    if (kind === 'letter') {
      const sourceResume = application.adaptedResumeId
        ? (await db.select().from(resumes).where(eq(resumes.id, application.adaptedResumeId)).limit(1))[0]
        : baseResume;
      const content = await generateCoverLetter(
        sourceResume?.textContent ?? baseResume.textContent,
        normalizedVacancy,
        profile.coverLetterTone ?? 'professional',
        profile.achievements ?? '',
        ai,
        memoryContext,
      );
      const [letter] = await db.insert(coverLetters).values({
        userId: application.userId,
        content,
        version: 1,
      }).returning();
      await db.update(applications).set({
        coverLetterId: letter.id,
        status: 'pending_review',
        updatedAt: new Date(),
      }).where(eq(applications.id, applicationId));
    }

    return { success: true, kind };
  });

  // ─── Supply workers ───────────────────────────────────────────────────────

  await boss.work('refresh_ats_registry', async () => {
    console.log('[Worker] Refreshing ATS board registry (Greenhouse)...');
    const resultsGreenhouse = await refreshAtsBoardRegistry('greenhouse', 250);
    console.log('[Worker] Refreshing ATS board registry (Lever)...');
    const resultsLever = await refreshAtsBoardRegistry('lever', 150);
    console.log('[Worker] Refreshing ATS board registry (Ashby)...');
    const resultsAshby = await refreshAtsBoardRegistry('ashby', 150);
    console.log('[Worker] Refreshing ATS board registry (SmartRecruiters)...');
    const resultsSmart = await refreshAtsBoardRegistry('smartrecruiters', 150);
    console.log('[Worker] Refreshing ATS board registry (Recruitee)...');
    const resultsRecruitee = await refreshAtsBoardRegistry('recruitee', 150);
    const results = [...resultsGreenhouse, ...resultsLever, ...resultsAshby, ...resultsSmart, ...resultsRecruitee];
    const valid = results.filter((r) => r.ok).length;
    const invalid = results.filter((r) => !r.ok).length;
    console.log(`[Worker] Registry refresh done: ${valid} valid, ${invalid} invalid out of ${results.length} checked.`);

    const metrics = await getAtsRegistryMetrics();
    console.log(`[Worker] Registry metrics: ${JSON.stringify(metrics)}`);

    // Schedule next refresh in 12h
    await queueRegistryRefresh(new Date(Date.now() + 12 * 60 * 60 * 1000));
    return { success: true, checked: results.length, valid, invalid };
  });

  await boss.work('refresh_job_cache', async () => {
    console.log('[Worker] Refreshing shared job cache (one central fetch for all users)...');
    const result = await refreshJobCache();
    console.log(`[Worker] Job cache refreshed: ${result.total} jobs cached`, result.byPlatform);
    // Refresh every 5h so it stays ahead of the 6h TTL.
    await queueJobCacheRefresh(new Date(Date.now() + 5 * 60 * 60 * 1000));
    return { success: true, ...result };
  });

  await boss.work('re_evaluate_vacancies', async (jobs: any) => {
    const userId = jobs?.[0]?.data?.userId ?? jobs?.data?.userId;
    if (!userId) return { skipped: true };
    console.log(`[Worker] Re-evaluating stored vacancies for ${userId} against current rules...`);
    const r = await reEvaluateVacancies(userId);
    console.log(`[Worker] Re-evaluation: checked ${r.checked}, hidden ${r.hidden}, rescored ${r.rescored}`);
    // Run again in 6h so rule changes keep applying to history.
    await queueReEvaluate(userId, new Date(Date.now() + 6 * 60 * 60 * 1000));
    return { success: true, ...r };
  });

  await boss.work('discover_ats_boards', async () => {
    console.log('[Worker] Running ATS board discovery...');
    // Ensure seed boards are in the registry
    await seedAtsBoards(DEFAULT_GREENHOUSE_BOARDS, 'greenhouse');
    await seedAtsBoards(seedLeverBoards, 'lever');
    await seedAtsBoards(seedAshbyBoards, 'ashby');
    await seedAtsBoards(seedSmartRecruitersBoards, 'smartrecruiters');
    await seedAtsBoards(seedRecruiteeBoards, 'recruitee');

    // Run dynamic web search for new boards globally
    const discoveryResult = await searchAtsWeb();
    console.log(`[Worker] Dynamic Web Search Result:`, discoveryResult);

    const metrics = await getAtsRegistryMetrics();
    console.log(`[Worker] Post-discovery metrics: ${JSON.stringify(metrics)}`);

    // Schedule next discovery in 6h to keep growing the registry continuously.
    await queueBoardDiscovery(new Date(Date.now() + 6 * 60 * 60 * 1000));
    return { success: true, metrics };
  });

  // Rescue orphaned assisted applications. 'approved' means "assisted window open,
  // worker watching". A freshly booted worker has ZERO active watchers, so any app
  // still in 'approved' is orphaned (its watcher died when the worker last stopped/
  // crashed) and would otherwise spin forever in the UI. Reset them to
  // 'pending_review' so the user can retry instead of staring at a dead spinner.
  try {
    const orphans = await db.update(applications)
      .set({ status: 'pending_review', updatedAt: new Date() })
      .where(eq(applications.status, 'approved'))
      .returning({ id: applications.id });
    if (orphans.length) console.log(`[Worker] Rescued ${orphans.length} orphaned assisted application(s) -> pending_review.`);
  } catch (e) {
    console.warn('[Worker] Orphan rescue failed:', (e as Error)?.message ?? e);
  }

  // Schedule initial supply jobs
  console.log('[Worker] Scheduling initial supply jobs...');
  await queueRegistryRefresh().catch(() => console.log('[Worker] Registry refresh already scheduled.'));
  await queueBoardDiscovery().catch(() => console.log('[Worker] Board discovery already scheduled.'));
  await queueJobCacheRefresh().catch(() => console.log('[Worker] Job cache refresh already scheduled.'));

  // Re-evaluate each user's stored vacancies against the current rules on startup
  // (so rule changes apply to history) and then on a 6h cadence.
  try {
    const allProfiles = await db.select({ userId: professionalProfiles.userId }).from(professionalProfiles);
    for (const p of allProfiles) await queueReEvaluate(p.userId).catch(() => undefined);
  } catch (e) {
    console.warn('[Worker] could not schedule re-evaluation:', (e as Error)?.message ?? e);
  }

  console.log('[Worker] Listening for jobs (search_vacancies, prepare_application_materials, process_application, assisted_apply, regenerate_materials, refresh_ats_registry, discover_ats_boards)...');
}

/**
 * Resolves the board tokens to scan for a given platform, feeding each ATS
 * adapter tokens that belong to its OWN platform. Greenhouse honors
 * user-configured tokens (notes / env); otherwise every platform paginates
 * through its own registry batch and falls back to its seed list.
 */
async function resolveBoardTokens(
  platform: string,
  notes: string | null | undefined,
  offset: number,
): Promise<string[]> {
  if (platform === 'greenhouse') {
    const configured = notes || process.env.GREENHOUSE_BOARD_TOKENS || '';
    const parsed = configured
      .split(/[\n,]/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (parsed.length > 0) return parsed;
  }

  let activeTokens = await getActiveAtsBoardTokensBatch(platform, 100, offset);
  // If the shared cursor has paged past this platform's registry, wrap to the start.
  if (activeTokens.length === 0 && offset > 0) {
    activeTokens = await getActiveAtsBoardTokensBatch(platform, 100, 0);
  }
  if (activeTokens.length > 0) return activeTokens;

  // Last-resort seeds so a platform never silently returns zero sources.
  if (platform === 'lever') return seedLeverBoards.map((b) => b.token);
  if (platform === 'ashby') return seedAshbyBoards.map((b) => b.token);
  if (platform === 'smartrecruiters') return seedSmartRecruitersBoards.map((b) => b.token);
  if (platform === 'recruitee') return seedRecruiteeBoards.map((b) => b.token);
  return DEFAULT_GREENHOUSE_BOARD_TOKENS;
}

// Start if executed directly
if (require.main === module) {
  startWorkers().catch((err) => {
    console.error('Fatal worker error:', err);
    process.exit(1);
  });
}
