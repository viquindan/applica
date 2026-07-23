import { loadEnvLocal } from '@/lib/loadEnvLocal';
loadEnvLocal();
import { getBoss, queueSearch, queueProcessApplication, queueReEvaluate, queueAssistedApply } from './boss';
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
import { GenericAdapter } from '../platforms/genericAdapter';
import { processVacancyForUser } from '../pipeline/processVacancy';
import { buildSearchRoles } from '../scoring/fitScorer';
import { sendPushToUser } from '../notifications/pushSender';
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
import { discoverCompaniesFromDirectories, discoverNewWikipediaCategories } from '../platforms/companyDirectoryDiscovery';
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

const VACANCY_TIMEOUT_MS = Number(process.env.VACANCY_PROCESS_TIMEOUT_MS ?? 90_000);

// Per-item hard cap around processVacancyForUser during a search run. The AI
// limiter's own timeout only guards its own calls - a hang anywhere else in
// this path (Playwright form inspection past its internal timeout, a stuck
// PDF render, a library retry loop that doesn't honor abortSignal) would
// otherwise stall the whole batch forever, and the search never reaches its
// final "success" update - which is exactly what kept showing 0 new vacancies
// after a search that looked "done" in the logs. One slow vacancy degrades to
// "counted as filtered", it doesn't block every vacancy behind it.
function withVacancyTimeout<T>(promise: Promise<T>, label: string): Promise<T | { timedOut: true }> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[Worker] Vacancy processing timed out after ${VACANCY_TIMEOUT_MS / 1000}s: ${label}`);
      resolve({ timedOut: true });
    }, VACANCY_TIMEOUT_MS);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); console.warn(`[Worker] Vacancy processing failed: ${label}:`, (e as Error)?.message ?? e); resolve({ timedOut: true }); },
    );
  });
}
// Fallback used ONLY by the assisted_apply handler below, for platforms with
// no dedicated adapter. Never added to `adapters` itself - every other lookup
// against that map (search, process_application, formPreview) must keep
// failing/skipping exactly as before for unknown platforms.
const genericAdapter = new GenericAdapter();

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
        // Distinguish a REAL concurrent search from a stale flag left by a
        // hard death (SIGKILL/OOM mid-search skips both the success and the
        // catch cleanup). Found real in production 2026-07-23 (2nd audit): a
        // user sat >24h with search_in_progress=t, zero scheduled search
        // jobs, and every manual "Buscar ahora" rejected - permanent, silent
        // lockout. A genuine in-flight search touches updatedAt when it sets
        // the flag and finishes well under 30 min, so an older flag can only
        // be an orphan: reclaim it and run instead of skipping forever.
        const flagAgeMs = Date.now() - (settings.updatedAt?.getTime() ?? 0);
        if (flagAgeMs < 30 * 60 * 1000) {
          console.log(`[Worker] Search already in progress for user ${userId}. Skipping duplicate.`);
          return { message: 'Search already in progress' };
        }
        console.warn(`[Worker] Stale searchInProgress flag for user ${userId} (${Math.round(flagAgeMs / 60000)} min old) - reclaiming.`);
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
      const planLimits = await getUserPlanLimits(userId);
      // Quota is charged at SEND time (swipe), not at preparation - so the
      // per-user month count is no longer needed to prepare materials.
      const context = { user, profile, settings, planLimits };

      // Resolve a rotating cursor once per run so each platform paginates through
      // its own registry across successive searches.
      const cursorState = await getSearchCursorState();
      const cursorOffset = cursorState.searchCursorOffset ?? 0;

      const enabledNames = new Set<string>(activePlatforms.map((p) => p.platformName));
      // Target roles are a guide, not a hard filter: also search for roles the
      // candidate's CV/experience qualifies them for (buildSearchRoles derives
      // them from experience and dedupes against the explicit targets), so the
      // pool includes strong adjacent matches - e.g. "Director of Operations"
      // for someone who has run operations but only listed fintech titles. The
      // scorer weights these experience-derived matches slightly below explicit
      // ones (see fitScorer.ts). Falls back to whatever targetRoles exist if
      // there's no experience to derive from.
      const searchRoles = buildSearchRoles({
        ...profile,
        homeCountry: user?.country || user?.location,
      } as any);
      const roles = searchRoles.all.length ? searchRoles.all : (profile?.targetRoles ?? []);
      const locations = profile?.targetCountries ?? [];
      const homeCountries = [user?.country, user?.location].filter((c): c is string => Boolean(c));
      const maxAgeDays = settings?.maxVacancyAgeDays ?? 14;
      // If the candidate accepts remote work, the location pre-filter must keep
      // every remote posting (the scorer decides the fine geo fit). Default to
      // true when no modality prefs exist so nobody's pool silently shrinks.
      const acceptsRemote = user?.workModalityPrefs?.acceptsRemote ?? true;

      // Build the candidate pool. Fast path: the shared cache (one central fetch
      // serves all users). Fallback: live per-platform fetch if the cache is cold.
      let vacancies: Awaited<ReturnType<typeof gatherSearchCandidates>> = [];
      if (isJobCacheFresh()) {
        // SmartRecruiters is the single largest source (~46k jobs) but is NOT
        // in the shared cache (its postings need a per-listing detail fetch).
        // It's searched live here - and unlike the cached platforms we pull
        // ALL its active boards every run (it only has ~170), not a rotating
        // 100-board page, so its whole footprint is considered on every
        // search instead of drifting in and out with the cursor.
        const srTokens = enabledNames.has('smartrecruiters')
          ? await getActiveAtsBoardTokensBatch('smartrecruiters', 500, 0)
          : [];
        // No cap (decision 2026-07-21): a hard `limit: 200` here truncated the
        // region-matching pool via a coarse pre-score heuristic (searchRank in
        // atsSearchHelpers.ts - role + geo + recency + salary, NOT the real
        // fitScorer) BEFORE the real scorer ever ran. A candidate that would've
        // scored well on the real scorer but ranked outside the top 200 on that
        // coarse heuristic was silently never evaluated, every run - visible as
        // "region match: 200" flatlined regardless of the true pool size. Per
        // candidate cost here is a couple of cheap DB round-trips (eligibility/
        // fitScorer are pure JS); maybeSemanticAdjust only calls the embeddings
        // API for borderline scores AND only when ENABLE_SEMANTIC_RERANK is on,
        // so evaluating the full role+region pool is a slower search, not a
        // materially more expensive one.
        vacancies = await gatherSearchCandidates({ roles, locations, homeCountries, maxAgeDays, acceptsRemote, limit: 999999, smartRecruitersTokens: srTokens });
        // Honor explicit per-user platform opt-outs against the shared pool.
        vacancies = vacancies.filter((v) => enabledNames.has(v.platform));
        console.log(`[Worker] Cache hit: ${jobCacheSize()} cached jobs -> ${vacancies.length} candidates for user ${userId}`);
      } else {
        console.log('[Worker] Job cache cold - falling back to live per-platform fetch.');
        for (const p of activePlatforms) {
          const adapter = adapters[p.platformName as keyof typeof adapters];
          if (!adapter) continue;
          const boardTokens = await resolveBoardTokens(p.platformName, p.notes, cursorOffset);
          const found = await adapter.search({ limit: 50, boardTokens, roles, locations, homeCountries, maxAgeDays, acceptsRemote });
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

      // Real funnel telemetry (docs/SEARCH-ENGINE.md) - computed FROM this
      // actual run, not a separate estimate. "Expertise" re-filters the
      // already-in-memory cache with NO location constraint (free, no
      // network) purely to report how many match the role before region
      // narrows it further; "region" is the pool already computed above.
      const roleOnlyPool = isJobCacheFresh()
        ? await gatherSearchCandidates({ roles, locations: [], homeCountries: [], limit: 999999, smartRecruitersTokens: [] })
        : vacancies;
      let eligibleCount = 0;
      let highConfidenceCount = 0;
      let goodMatchCount = 0;

      let processedInLoop = 0;
      for (const vacancy of vacancies) {
        const result = await withVacancyTimeout(processVacancyForUser(userId, vacancy, context), `${vacancy.platform}:${vacancy.title}`);
        if ('applicationId' in result && result.applicationId) preparedCount += 1;
        else filteredCount += 1;
        if ('eligible' in result && result.eligible) {
          eligibleCount += 1;
          const s = (result as any).score as number | undefined;
          if (typeof s === 'number') {
            if (s >= 70) highConfidenceCount += 1;
            else if (s >= (settings?.minScoreToGenerateMaterials ?? 60)) goodMatchCount += 1;
          }
        }

        processedInLoop++;
        if (processedInLoop % 10 === 0) {
          await db.update(userSettings).set({
            lastSearchFilteredCount: filteredCount,
            lastSearchPreparedCount: preparedCount,
            updatedAt: new Date(),
          }).where(eq(userSettings.userId, userId));
        }
      }

      const registryMetrics = await getAtsRegistryMetrics();
      await db.update(userSettings).set({
        lastSearchFunnel: {
          universe: registryMetrics.jobsSeen,
          expertiseMatch: roleOnlyPool.length,
          regionMatch: vacancies.length,
          eligible: eligibleCount,
          highConfidence: highConfidenceCount,
          goodMatch: goodMatchCount,
        },
        updatedAt: new Date(),
      }).where(eq(userSettings.userId, userId));

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

      // Run LinkedIn Stealth Scraper - Pro-only. Gating here (not just inside
      // processVacancyForUser) avoids scraping a real headless browser for free
      // users whose results would be discarded as 'linkedin_pro_only' anyway.
      if (planLimits.canUseLinkedInScraper) {
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
          const result = await withVacancyTimeout(processVacancyForUser(userId, job, context), `linkedin:${job.title}`);
          if ('applicationId' in result && result.applicationId) preparedCount += 1;
          else filteredCount += 1;
        }, { concurrency: 5 });
      } else {
        console.log(`[Worker] Skipping LinkedIn scraper for user ${userId} - not on Pro plan.`);
      }

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
      // "preparedCount" here means "cleared the score threshold and got queued
      // for material prep", not yet visible in the Feed (prepare_application_materials
      // still has to run for each one) - wording says "preparando", never "listas".
      if (preparedCount > 0) {
        sendPushToUser(
          userId,
          preparedCount === 1 ? '1 vacante nueva' : `${preparedCount} vacantes nuevas`,
          preparedCount === 1
            ? 'Encontramos una vacante para ti. Applica la está preparando - revisa el Feed en unos minutos.'
            : `Encontramos ${preparedCount} vacantes para ti. Applica las está preparando - revisa el Feed en unos minutos.`,
        );
      }
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
        sendPushToUser(application.userId, 'Aplicación enviada', `${vacancy.title} en ${vacancy.company} fue enviada.`, { applicationId });
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
      // Captcha-gated boards: the silent headless attempt got blocked by a
      // human-verification challenge we don't bypass. Keep the application
      // 'approved' (so it surfaces in Pendientes exactly like an assisted
      // flow, never back in the swipe Feed) and open the real, visible
      // browser automatically - the user only has to click once they see it,
      // no extra tap to "start" the assisted step.
      const isAssistedCaptcha = result.submissionStatus === 'failed_captcha';
      if (isAssistedCaptcha) {
        await Promise.all([
          db.update(applications).set({ status: 'approved', updatedAt: new Date() }).where(eq(applications.id, applicationId)),
          db.update(vacancies).set({
            status: 'applying',
            warnings: [...(vacancy.warnings ?? []), result.failureReason ?? 'Esta empresa exige verificación humana (reCAPTCHA). Abrimos una ventana con todo listo - da el último clic.'],
            updatedAt: new Date(),
          }).where(eq(vacancies.id, vacancy.id)),
        ]);
        await queueAssistedApply(applicationId);
        sendPushToUser(
          application.userId,
          'Tu turno',
          `${vacancy.title} en ${vacancy.company}: Applica llenó todo, pero esta empresa exige verificación humana. Abre la app para dar el último clic.`,
          { applicationId },
        );
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
        if (isSubmitted) {
          sendPushToUser(
            application.userId,
            'Aplicación enviada',
            `${vacancy.title} en ${vacancy.company} fue enviada.`,
            { applicationId },
          );
        }
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

  // Pool of virtual-display slots for concurrent assisted-apply sessions (live
  // noVNC viewing plan, 2026-07-22): a single shared Xvfb (:99) meant only ONE
  // assisted session could run at a time for the WHOLE platform - user B's
  // captcha would queue behind user A's until A's finished or timed out (up to
  // 15 min). Explicit product decision: this must scale per user, bounded only
  // by real server capacity, not by a hardcoded single display. `ASSISTED_APPLY_POOL_SIZE`
  // fixed (Xvfb :100.. :10N / x11vnc / websockify) triples are provisioned on
  // the VPS via templated systemd units (`xvfb@.service` etc.) - this pool just
  // tracks which of those N slots are free. The worker is a single Node process
  // (no cluster), so an in-memory array is enough; no cross-process coordination
  // needed.
  const ASSISTED_POOL_SIZE = Number(process.env.ASSISTED_APPLY_POOL_SIZE ?? 10);
  const assistedPoolFree: number[] = Array.from({ length: ASSISTED_POOL_SIZE }, (_, i) => i);
  function acquirePoolSlot(): number | null {
    return assistedPoolFree.length ? assistedPoolFree.shift()! : null;
  }
  function releasePoolSlot(index: number) {
    if (!assistedPoolFree.includes(index)) assistedPoolFree.push(index);
  }

  // Assisted apply: open a VISIBLE browser on the user's machine with the form
  // pre-filled, and let the user finish (CAPTCHA + submit). We watch the window.
  // localConcurrency lets pg-boss run up to ASSISTED_APPLY_POOL_SIZE of these
  // handlers at once in this same process (pg-boss v12's replacement for the
  // older `teamSize` option) - without it, the library defaults to processing
  // this queue one job at a time, which was the real cause of the system-wide
  // single-session bottleneck.
  await boss.work('assisted_apply', { localConcurrency: ASSISTED_POOL_SIZE }, async (jobs: any) => {
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
    // Defensive: with localConcurrency === ASSISTED_POOL_SIZE a free slot
    // should always exist here, but never launch a browser without one -
    // that would put two sessions on the same display.
    const poolSlot = acquirePoolSlot();
    if (poolSlot === null) {
      console.warn(`[Worker] No free assisted-apply display slot for ${applicationId} - retrying later.`);
      await resetToReview('Todas las sesiones asistidas están ocupadas ahora mismo. Vuelve a intentar en unos minutos.');
      return { success: false, error: 'pool_exhausted' };
    }
    activeAssisted.add(applicationId);
    const display = `:${100 + poolSlot}`;
    await db.update(applications).set({
      assistedSessionStartedAt: new Date(),
      assistedSessionPoolIndex: poolSlot,
      updatedAt: new Date(),
    }).where(eq(applications.id, applicationId));

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
      // LinkedIn has its own dedicated Easy Apply engine (runLinkedInEasyApply) and
      // never reaches this handler via the normal UI flow - keep failing loudly here
      // rather than silently generic-filling linkedin.com's own React app.
      const knownAdapter = adapters[vacancy.platform as keyof typeof adapters];
      const adapter = knownAdapter ?? (vacancy.platform === 'linkedin' ? null : genericAdapter);
      if (!adapter) { await resetToReview(); return { message: `No adapter for ${vacancy.platform}` }; }
      if (!knownAdapter) console.log(`[Worker] No dedicated adapter for "${vacancy.platform}" - using GenericAdapter (best-effort, user-supervised).`);

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
      // Fired the FIRST time this session hits a captcha - the only moment the
      // user actually needs to show up (see the live-session/noVNC plan). Guards
      // against double-firing across the two possible engines below.
      let challengeNotified = false;
      const onChallenge = () => {
        if (challengeNotified) return;
        challengeNotified = true;
        sendPushToUser(
          application.userId,
          'Necesitamos que resuelvas un captcha',
          `${vacancy.title} en ${vacancy.company} está esperando tu ayuda para continuar.`,
          { applicationId },
        );
      };

      // Prefer the user's REAL browser (trusted fingerprint invisible captchas may
      // pass silently for a true auto-submit; also uses the real GPU). Falls back to
      // the bundled headful browser (pre-fill only) if no local browser is found.
      let outcome = await runRealBrowserApply(adapter, vacancy.url, applyCtx, { onChallenge });
      // Fall back to the bundled headful browser ONLY if the real browser couldn't
      // be LAUNCHED (not installed, or "opens in the existing session" and
      // Playwright loses control). An error INSIDE the real browser (adapter
      // timeout etc.) must NOT fall back: the bundled Chromium has none of the
      // user's sessions and no trusted fingerprint, which defeats the whole flow -
      // better to reset to pending_review and let the user retry in THEIR browser.
      if (outcome.status === 'error' && (outcome.reason === 'no_local_browser' || String(outcome.reason ?? '').startsWith('launch_failed'))) {
        console.log(`[Worker] Real browser unavailable (${outcome.reason}) - falling back to bundled headful on display ${display}.`);
        outcome = await runAssistedApply(adapter, vacancy.url, applyCtx, { display, onChallenge });
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
        sendPushToUser(application.userId, 'Aplicación enviada', `${vacancy.title} en ${vacancy.company} fue enviada.`, { applicationId });
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
      releasePoolSlot(poolSlot);
      // Clear regardless of how we got here (submitted, reverted, thrown) - a
      // stale timestamp would make /api/applications/[id]/live-session think
      // this session is still live after it's actually over.
      await db.update(applications).set({
        assistedSessionStartedAt: null,
        assistedSessionPoolIndex: null,
        updatedAt: new Date(),
      }).where(eq(applications.id, applicationId)).catch(() => {});
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

    const adapter = adapters[vacancy.platform as keyof typeof adapters];
    // Form inspection launches a real browser and parses a third-party form; on
    // JS-heavy ATSs (Ashby) it can throw or time out. A failure here must NOT
    // abort the whole prep (which leaves the app stuck in 'draft' and makes
    // pg-boss retry forever) - degrade to no preview so the app still completes
    // to pending_review with default prepared answers and the user can apply.
    // Runs BEFORE CV/cover-letter generation on purpose: whether to generate a
    // cover letter at all depends on what this specific form actually asks for.
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

    // Cover letters are the exception, not the rule: almost no ATS form
    // requires one. Only generate one when the actual form has a required
    // field for it (real DOM `required`, not a guess) - when we can't inspect
    // the form at all (LinkedIn, generic sites, inspection failure), default
    // to NOT generating one. The user can always regenerate it manually later
    // ("regenerate_letter") if a specific application turns out to need it.
    const coverLetterRequired = (formPreview?.fields ?? []).some(
      (field) => field.required && /cover\s*letter|carta\s*de\s*presentaci[oó]n/i.test(field.label),
    );

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

        if (coverLetterRequired) {
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
      }
    } catch (error: any) {
      console.warn(`[Worker] Material preparation failed for application ${applicationId}: ${error?.message ?? error}`);
      truthfulnessCheckPassed = false;
      await db.update(vacancies).set({
        warnings: [...(vacancy.warnings ?? []), 'No pudimos preparar el CV/carta a medida en este intento. Puedes regenerarlos o aplicar con tu CV base.'],
        updatedAt: new Date(),
      }).where(eq(vacancies.id, vacancy.id));
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

    // No auto-submit path exists before the user's swipe: 'skip' means the
    // vacancy never becomes a swipeable application, anything else lands in
    // pending_review and waits for the Feed swipe (see docs/DECISIONS.md).
    const nextVacancyStatus = decision.nextAction === 'skip' ? 'filtered' : 'pending_review';
    const nextApplicationStatus = decision.nextAction === 'skip' ? 'skipped' : 'pending_review';

    // 'pause' means Applica genuinely can't decide for the user (missing
    // resume, a salary/immigration question, a custom question with no bank
    // answer...) - distinct from a normal "ready to swipe" match, so it earns
    // its own notification instead of blending into the "N new vacancies"
    // summary from search_vacancies (that one fires regardless of whether any
    // of them need input).
    if (decision.nextAction === 'pause') {
      sendPushToUser(
        application.userId,
        'Necesita tu revisión',
        `${vacancy.title} en ${vacancy.company}: falta un dato que Applica no puede completar solo. Revísala en Pendientes.`,
        { applicationId: application.id },
      );
    }

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
  //
  // refresh_ats_registry / refresh_job_cache / discover_ats_boards /
  // discover_companies_directory used to reschedule themselves by sending a
  // new pg-boss job with `startAfter: +Nh` under the SAME singletonKey. That
  // is fragile across restarts: if this process dies and restarts before that
  // future job fires, pg-boss still has a "pending" job under that singleton
  // key, so this process's own boot-time `queueXxx()` call silently no-ops
  // (thinks a refresh is already scheduled) - and if THAT pending job also
  // never gets to run (e.g. another restart happens near its fire time), the
  // whole chain quietly dies forever with no further refreshes, no error, no
  // log. This is exactly what happened in production (2026-07-17): after a
  // string of restarts, the shared job cache got stuck for 15h+ on stale data
  // from before a 71->1012 board registry expansion, so every user's search
  // fell back to the thin "cache cold" live-fetch path and matched almost
  // nothing - looked like a matching/scoring bug but was actually this.
  //
  // Fix: these four are now driven by an in-process setInterval (below, after
  // the boss.work registrations) that calls the underlying function directly,
  // independent of any pg-boss-persisted schedule. As long as the worker
  // process is alive, they run on a fixed cadence no matter what the DB
  // singleton state remembers from a previous process. boss.work stays wired
  // so `boss.send(...)` can still trigger one manually/externally if needed.

  async function runRegistryRefresh() {
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
    return { success: true, checked: results.length, valid, invalid, metrics };
  }

  async function runJobCacheRefresh() {
    console.log('[Worker] Refreshing shared job cache (one central fetch for all users)...');
    const result = await refreshJobCache();
    console.log(`[Worker] Job cache refreshed: ${result.total} jobs cached`, result.byPlatform);
    return { success: true, ...result };
  }

  await boss.work('refresh_ats_registry', async () => runRegistryRefresh());
  await boss.work('refresh_job_cache', async () => runJobCacheRefresh());

  await boss.work('re_evaluate_vacancies', async (jobs: any) => {
    const userId = jobs?.[0]?.data?.userId ?? jobs?.data?.userId;
    if (!userId) return { skipped: true };
    console.log(`[Worker] Re-evaluating stored vacancies for ${userId} against current rules...`);
    const r = await reEvaluateVacancies(userId);
    console.log(`[Worker] Re-evaluation: checked ${r.checked}, hidden ${r.hidden}, rescored ${r.rescored}, promoted ${r.promoted}`);
    // Run again in 6h so rule changes keep applying to history.
    await queueReEvaluate(userId, new Date(Date.now() + 6 * 60 * 60 * 1000));
    return { success: true, ...r };
  });

  async function runBoardDiscovery() {
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
    return { success: true, metrics };
  }

  // High-yield complement to the SERP-based discovery above: probes real
  // company names pulled from public Wikipedia directories (rotating batch of
  // categories, see companyDirectoryDiscovery.ts) against every ATS platform.
  // This is the same technique that grew the registry from 71 to 1,012 active
  // boards in one session (2026-07-17), now automated so it keeps compounding.
  async function runCompanyDirectoryDiscovery() {
    console.log('[Worker] Running Wikipedia company directory discovery...');
    const result = await discoverCompaniesFromDirectories();
    console.log(`[Worker] Directory discovery: categories=${result.categoriesUsed.join(', ')} names=${result.namesCollected} probed=${result.probed} added=${result.added}`);
    const metrics = await getAtsRegistryMetrics();
    console.log(`[Worker] Post-directory-discovery metrics: ${JSON.stringify(metrics)}`);
    return { success: true, ...result, metrics };
  }

  // Self-expanding companion to runCompanyDirectoryDiscovery (2026-07-23): the
  // rotating category list used to be a hardcoded array that quietly
  // saturated after enough sessions reused it (real bug, confirmed live - a
  // sampled category was 74% already-known). Crawls Wikipedia's own category
  // tree (by industry/country/city/founding year) to add genuinely new
  // categories to ats_discovery_categories on its own - weekly cadence
  // because it's just navigating category metadata, not probing company
  // names, so it doesn't need to run as often as the discovery job itself.
  async function runCategoryTreeExpansion() {
    console.log('[Worker] Expanding Wikipedia discovery category pool...');
    const result = await discoverNewWikipediaCategories();
    console.log(`[Worker] Category pool expansion: scanned=${result.scanned} added=${result.added}`);
    return { success: true, ...result };
  }

  await boss.work('discover_ats_boards', async () => runBoardDiscovery());
  await boss.work('discover_companies_directory', async () => runCompanyDirectoryDiscovery());
  await boss.work('expand_discovery_categories', async () => runCategoryTreeExpansion());

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

  // Same rescue principle for searchInProgress: a freshly booted worker has
  // ZERO searches running (single worker process, see ecosystem.config.js),
  // so any user still flagged in-progress is an orphan from a hard death
  // (SIGKILL/OOM skips both cleanup paths in the search handler). Found real
  // in production 2026-07-23 (2nd audit): one of six users stuck >24h with
  // the flag on and no scheduled search job - no automatic search would ever
  // run again for them and every manual "Buscar ahora" got rejected, with no
  // visible error anywhere. Reset the flag AND re-queue their search so they
  // rejoin the normal cadence instead of staying silently dead.
  try {
    const stuck = await db.update(userSettings)
      .set({ searchInProgress: false, lastSearchStatus: 'failed', lastSearchError: 'Búsqueda interrumpida por un reinicio del sistema - reprogramada.', updatedAt: new Date() })
      .where(eq(userSettings.searchInProgress, true))
      .returning({ userId: userSettings.userId });
    for (const row of stuck) {
      console.log(`[Worker] Rescued stuck searchInProgress flag for user ${row.userId} - re-queueing their search.`);
      await queueSearch(row.userId);
    }
  } catch (e) {
    console.warn('[Worker] Stuck-search rescue failed:', (e as Error)?.message ?? e);
  }

  // Supply-job cadence: run each once now (fire-and-forget, doesn't delay the
  // worker's readiness for other queues) and then on a fixed in-process
  // interval - see the long comment above runRegistryRefresh() for why this
  // replaced pg-boss's self-rescheduling singleton pattern. Job cache first
  // and un-awaited since it's the most user-visible (a stale/empty cache means
  // every search falls back to a thin live-fetch and matches almost nothing).
  console.log('[Worker] Starting supply-job schedules (job cache, registry refresh, board discovery, company directory discovery)...');
  runJobCacheRefresh().catch((e) => console.warn('[Worker] Initial job cache refresh failed:', (e as Error)?.message ?? e));
  setInterval(() => runJobCacheRefresh().catch((e) => console.warn('[Worker] Job cache refresh failed:', (e as Error)?.message ?? e)), 5 * 60 * 60 * 1000);

  runRegistryRefresh().catch((e) => console.warn('[Worker] Initial registry refresh failed:', (e as Error)?.message ?? e));
  setInterval(() => runRegistryRefresh().catch((e) => console.warn('[Worker] Registry refresh failed:', (e as Error)?.message ?? e)), 12 * 60 * 60 * 1000);

  runBoardDiscovery().catch((e) => console.warn('[Worker] Initial board discovery failed:', (e as Error)?.message ?? e));
  setInterval(() => runBoardDiscovery().catch((e) => console.warn('[Worker] Board discovery failed:', (e as Error)?.message ?? e)), 4 * 60 * 60 * 1000);

  runCompanyDirectoryDiscovery().catch((e) => console.warn('[Worker] Initial company directory discovery failed:', (e as Error)?.message ?? e));
  setInterval(() => runCompanyDirectoryDiscovery().catch((e) => console.warn('[Worker] Company directory discovery failed:', (e as Error)?.message ?? e)), 24 * 60 * 60 * 1000);

  runCategoryTreeExpansion().catch((e) => console.warn('[Worker] Initial category pool expansion failed:', (e as Error)?.message ?? e));
  setInterval(() => runCategoryTreeExpansion().catch((e) => console.warn('[Worker] Category pool expansion failed:', (e as Error)?.message ?? e)), 7 * 24 * 60 * 60 * 1000);

  // Re-evaluate each user's stored vacancies against the current rules on startup
  // (so rule changes apply to history) and then on a 6h cadence.
  try {
    const allProfiles = await db.select({ userId: professionalProfiles.userId }).from(professionalProfiles);
    for (const p of allProfiles) await queueReEvaluate(p.userId).catch(() => undefined);
  } catch (e) {
    console.warn('[Worker] could not schedule re-evaluation:', (e as Error)?.message ?? e);
  }

  console.log('[Worker] Listening for jobs (search_vacancies, prepare_application_materials, process_application, assisted_apply, regenerate_materials, refresh_ats_registry, discover_ats_boards, discover_companies_directory)...');
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
