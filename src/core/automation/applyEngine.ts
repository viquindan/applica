import { Page } from 'playwright';
import { createIncognitoContext, closeBrowser } from './browserManager';
import { saveEvidenceScreenshot } from './evidenceSaver';
import { ApplicationSubmission } from '@/db/schema';
import { PlatformAdapter } from '../platforms/PlatformAdapter';

export interface ApplyContext {
  page: Page;
  applicationId: string;
  profileData: any;
  resumePath: string;
  coverLetterContent?: string;
  formAnswers: Record<string, string>;
  /**
   * Assisted mode: fill the whole form but DO NOT click submit and DO NOT close
   * the browser. Used to open the offer in a visible window on the user's own
   * machine with everything pre-filled, so they just solve the CAPTCHA and submit.
   */
  fillOnly?: boolean;
}

export async function runAutomatedApplication(
  adapter: PlatformAdapter,
  url: string,
  contextData: Omit<ApplyContext, 'page'>
): Promise<Partial<ApplicationSubmission>> {
  const browserContext = await createIncognitoContext();
  const page = await browserContext.newPage();

  let result: Partial<ApplicationSubmission> = {
    platformName: adapter.name,
    submittedAutomatically: false,
    logs: [],
  };

  try {
    const applyContext: ApplyContext = { ...contextData, page };

    // Check for CAPTCHA
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    if (await isCaptchaPresent(page)) {
      result.submissionStatus = 'failed_captcha';
      result.failureReason = 'CAPTCHA detected before applying';
      result.logs!.push({ level: 'error', message: 'CAPTCHA barrier hit', timestamp: new Date().toISOString() });
      const buffer = await page.screenshot({ fullPage: true });
      result.screenshotPath = await saveEvidenceScreenshot(contextData.applicationId, buffer, 'captcha');
      return result;
    }

    // Hand off to Platform Adapter implementation
    // The adapter is responsible for specific locators and sequence
    const adapterResult = await adapter.applyPlaywright?.(url, applyContext);

    if (adapterResult) {
      result = { ...result, ...adapterResult };
      result.submittedAutomatically = adapterResult.submittedAutomatically ?? adapterResult.status === 'submitted';
    } else {
      throw new Error(`Platform adapter ${adapter.name} does not implement applyPlaywright`);
    }

    // Take result evidence
    const successBuffer = await page.screenshot({ fullPage: true });
    result.evidencePath = await saveEvidenceScreenshot(contextData.applicationId, successBuffer, 'success');
    result.submissionStatus = result.submissionStatus ?? 'success';
    result.status = result.status ?? 'submitted';

  } catch (error: any) {
    console.error(`[ApplyEngine] Error applying to ${url}:`, error);
    result.submissionStatus = 'failed_error';
    result.status = 'failed';
    result.failureReason = error.message || 'Unknown error during automation';

    try {
      const errorBuffer = await page.screenshot({ fullPage: true });
      result.screenshotPath = await saveEvidenceScreenshot(contextData.applicationId, errorBuffer, 'failure');
    } catch (ssError) {
      console.error('[ApplyEngine] Could not take error screenshot', ssError);
    }
  } finally {
    await browserContext.close();
  }

  return result;
}

async function isCaptchaPresent(page: Page): Promise<boolean> {
  // Only a VISIBLE challenge should block us. Most legit forms (e.g. Greenhouse)
  // embed an INVISIBLE reCAPTCHA that runs in the background and never challenges
  // - aborting on its mere presence would block almost every application.

  // Hard blockers (interstitial challenge pages) - always block.
  for (const sel of ['#cf-turnstile', '.cf-turnstile', '#challenge-running']) {
    if (await page.locator(sel).count() > 0) return true;
  }

  // reCAPTCHA / hCaptcha: ignore invisible variants; only block when a visible
  // challenge frame (the image-grid "bframe", or a visible widget) is shown.
  const challengeFrames = page.locator(
    'iframe[src*="recaptcha"][src*="bframe"], iframe[title*="recaptcha challenge" i], iframe[src*="hcaptcha"][src*="challenge"], iframe[title*="hCaptcha challenge" i]',
  );
  const n = await challengeFrames.count();
  for (let i = 0; i < n; i++) {
    if (await challengeFrames.nth(i).isVisible().catch(() => false)) return true;
  }
  return false;
}
