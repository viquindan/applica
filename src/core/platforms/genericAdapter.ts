import type { PlatformAdapter } from './PlatformAdapter';
import type { ApplyContext } from '../automation/applyEngine';
import type { ApplicationSubmission } from '@/db/schema';
import { fillEverythingKnown } from './universalFill';

/**
 * Fallback adapter for any vacancy whose platform isn't one of our known,
 * battle-tested ATS (greenhouse/lever/ashby/smartrecruiters/recruitee). Used
 * ONLY by the assisted_apply flow (a visible, user-supervised browser window) -
 * never by the silent process_application path, and never for LinkedIn or
 * registration-gated sites (workday/icims/taleo/brassring), which have their
 * own dedicated handling upstream. See docs/APPLY-ENGINE.md before touching.
 *
 * Deliberately minimal: does ONE best-effort fill pass and hands off to the
 * shared vigilance loop in assistedApply.ts (which is already 100%
 * adapter-agnostic - it re-runs fillEverythingKnown every tick, freezes on
 * captcha, and auto-advances via generic Submit/Next button matching). This
 * adapter's only job is the part the loop can't do: reveal the form and
 * attach the CV once. It NEVER attempts to click Submit itself - that stays
 * gated by the loop's own missingRequiredCount + ENABLE_REAL_SUBMISSIONS
 * check, same safety net every ATS already goes through.
 */
export class GenericAdapter implements PlatformAdapter {
  name = 'generic';

  async search() {
    // Not a discovery source - generic vacancies come from LinkedIn external
    // redirects or direct URLs, never from searching "the whole internet".
    return [];
  }

  async extractVacancy() {
    return null;
  }

  async apply(): Promise<Partial<ApplicationSubmission>> {
    throw new Error('[Generic] Use applyPlaywright via the assisted-apply real-browser flow.');
  }

  async applyPlaywright(url: string, context: ApplyContext): Promise<Partial<ApplicationSubmission>> {
    const { page, profileData, resumePath, formAnswers } = context;
    const logs: Array<{ timestamp: string; level: string; message: string }> = [];
    const log = (message: string) => logs.push({ timestamp: new Date().toISOString(), level: 'info', message });

    // Contract: the adapter navigates, not the caller (runRealBrowserApply hands
    // us an about:blank page). Skip if we're already on the right origin (the
    // fillOnly/runAssistedApply path navigates before calling us).
    try {
      const target = new URL(url);
      const current = new URL(page.url());
      if (current.origin !== target.origin || page.url() === 'about:blank') {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => log(`goto warning: ${(e as Error)?.message ?? e}`));
    }

    // Reveal the form if it's behind an "Apply"/"I'm interested" trigger (same
    // heuristic as genericFormScraper.ts, which only READS - we also fill).
    const startBtn = page.locator('a:has-text("Apply"), button:has-text("Apply"), button:has-text("I\'m interested"), a:has-text("Aplicar"), button:has-text("Aplicar")').first();
    if (await startBtn.count().catch(() => 0)) {
      await startBtn.click({ timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(1500);
      log('Clicked a generic Apply trigger to reveal the form.');
    }

    // Best-effort CV attach: try the native file-chooser first (the only thing
    // that registers on JS-managed dropzone widgets, per Greenhouse/SR's
    // documented quirks in APPLY-ENGINE.md #8), then fall back to a direct
    // setInputFiles on any plain <input type=file> - most vanilla company
    // career pages use exactly that, no fancy widget.
    if (resumePath) {
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.count().catch(() => 0)) {
        const uploadTrigger = page.locator('button:has-text("Upload"), button:has-text("Attach"), button:has-text("Subir"), button:has-text("Adjuntar")').first();
        let attached = false;
        if (await uploadTrigger.count().catch(() => 0)) {
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
            uploadTrigger.click({ timeout: 4000 }).catch(() => undefined),
          ]);
          if (chooser) {
            await chooser.setFiles(resumePath).catch((e: unknown) => log(`filechooser warning: ${(e as Error)?.message ?? e}`));
            attached = true;
          }
        }
        if (!attached) {
          await fileInput.setInputFiles(resumePath).catch((e) => log(`CV setInputFiles warning: ${(e as Error)?.message ?? e}`));
        }
        log('Attempted generic CV attach.');
      }
    }

    // One immediate fill pass - the vigilance loop in assistedApply.ts keeps
    // re-running this every ~2s afterward, so this is just a head start.
    try {
      await fillEverythingKnown(page, profileData, formAnswers ?? {}, log);
    } catch (e) {
      log(`Generic fill warning: ${(e as Error)?.message ?? e}`);
    }

    // Never self-submit here - hand off to the shared loop's gated auto-advance,
    // exactly like every known ATS does when it doesn't submit itself.
    return { status: 'pending_review', submissionStatus: 'assisted_ready', logs };
  }
}
