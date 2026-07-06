import type { Locator, Page } from 'playwright';
import { createIncognitoContext } from './browserManager';
import { getLinkedInCookies, markLinkedInSessionExpired, normalizeLinkedInUrl, setLinkedInSession } from './linkedinSession';
import { saveEvidenceScreenshot } from './evidenceSaver';

/**
 * LinkedIn "Easy Apply" automation engine.
 *
 * Injects the user's stored session, opens the job, and walks the multi-step
 * Easy Apply modal: fills contact info, attaches the resume, and answers
 * screening questions from the prepared `formAnswers`. In DRY-RUN (default) it
 * stops right before the final "Submit" and screenshots - so we can verify the
 * whole flow without actually applying.
 *
 * Selectors are defensive (multiple fallbacks) because LinkedIn's DOM shifts.
 * Expect to tune them after the first real run against a live posting.
 */

export type LinkedInApplyInput = {
  userId: string;
  jobUrl: string;
  evidenceId?: string;
  profileData?: { firstName?: string; lastName?: string; email?: string; phone?: string };
  resumePath?: string;
  formAnswers?: Record<string, string>;
  dryRun?: boolean;
};

export type LinkedInApplyStatus =
  | 'submitted' | 'dry_run' | 'needs_review' | 'checkpoint'
  | 'not_easy_apply' | 'external_apply' | 'session_invalid' | 'failed';

export type LinkedInApplyResult = {
  status: LinkedInApplyStatus;
  reason?: string;
  steps?: number;
  unanswered?: string[];
  screenshotPath?: string;
  externalUrl?: string;
  logs: string[];
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Robustly capture the company's external application URL from a LinkedIn job
 * page (logged-in view). LinkedIn's "Apply" button is usually a <button> that
 * opens the offsite URL in a NEW TAB (not an <a href>), so we race a popup
 * against a same-tab navigation, with several fallbacks. Verbose logging so a
 * real run tells us exactly what happened.
 */
async function captureExternalApplyUrl(page: Page, jobUrl: string, log: (m: string) => void): Promise<string | undefined> {
  const notLinkedIn = (u?: string | null) => !!u && /^https?:/i.test(u) && !/linkedin\.com/i.test(u);

  // 0) An offsite anchor sometimes exists directly on the page.
  try {
    const offsite = page.locator('a[href^="http"]:not([href*="linkedin.com"])').filter({ hasText: /apply/i }).first();
    if (await offsite.count()) {
      const h = await offsite.getAttribute('href');
      if (notLinkedIn(h)) { log('captured via offsite anchor'); return h!; }
    }
  } catch { /* ignore */ }

  const applyBtn = page.locator([
    'button.jobs-apply-button',
    'a.jobs-apply-button',
    '.jobs-apply-button--top-card button',
    '.jobs-s-apply button',
    'button[aria-label*="Apply" i]',
    'a[aria-label*="Apply" i]',
  ].join(', ')).first();

  const count = await applyBtn.count().catch(() => 0);
  log(`apply button candidates: ${count}`);
  if (!count) return undefined;

  // 1) Maybe it's an anchor with an href.
  try {
    const href = await applyBtn.getAttribute('href').catch(() => null);
    if (notLinkedIn(href)) { log('captured via button href'); return href!; }
  } catch { /* ignore */ }

  // 2) Click race a popup (new tab) vs a same-tab navigation.
  try {
    await applyBtn.scrollIntoViewIfNeeded().catch(() => undefined);
    const popupP = page.context().waitForEvent('page', { timeout: 12000 }).catch(() => null);
    const navP = page.waitForNavigation({ timeout: 12000 }).catch(() => null);
    await applyBtn.click({ timeout: 8000 }).catch((e) => log(`apply click failed: ${e?.message ?? e}`));
    const popup = await popupP;
    if (popup) {
      await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined);
      const u = popup.url();
      await popup.close().catch(() => undefined);
      if (notLinkedIn(u)) { log('captured via popup/new-tab'); return u; }
      log(`popup opened but stayed on linkedin: ${u}`);
    } else {
      await navP;
      await page.waitForTimeout(2000);
      const cur = page.url();
      if (notLinkedIn(cur)) { log('captured via same-tab navigation'); return cur; }
      log(`no popup; current url still linkedin: ${cur}`);
    }
  } catch (e: any) {
    log(`capture error: ${e?.message ?? e}`);
  }
  return undefined;
}

/** Detect a LinkedIn security checkpoint / CAPTCHA that needs a human. */
async function isCheckpoint(page: Page): Promise<boolean> {
  if (/checkpoint|challenge|captcha|security-verification|add-phone/i.test(page.url())) return true;
  const sels = [
    'iframe[src*="captcha" i]', 'iframe[src*="recaptcha"]', 'iframe[title*="captcha" i]',
    '#captcha-internal', '.challenge-dialog', '[data-test-checkpoint]', 'form[action*="checkpoint"]',
  ];
  for (const s of sels) {
    try { if ((await page.locator(s).first().count()) > 0) return true; } catch { /* ignore */ }
  }
  return false;
}

/** Find a prepared answer whose question best matches a modal field label. */
function matchAnswer(label: string, answers: Record<string, string> = {}): string | null {
  const nl = normalize(label);
  if (!nl) return null;
  for (const [q, a] of Object.entries(answers)) {
    const nq = normalize(q);
    if (nq && (nl.includes(nq) || nq.includes(nl))) return a;
  }
  return null;
}

async function fieldIsRequired(group: Locator): Promise<boolean> {
  try {
    if (await group.locator('[aria-required="true"], [required]').count() > 0) return true;
    const txt = await group.innerText();
    return /\*\s*$/m.test(txt) || /required/i.test(txt);
  } catch {
    return false;
  }
}

/** Fill every fillable field in the currently visible modal step. */
async function fillStep(
  modal: Locator,
  input: LinkedInApplyInput,
  unanswered: string[],
  log: (m: string) => void,
): Promise<void> {
  // Contact phone (often the only empty contact field).
  try {
    const phone = modal.locator('input[id*="phoneNumber" i], input[name*="phoneNumber" i]').first();
    if (input.profileData?.phone && (await phone.count())) {
      const cur = await phone.inputValue().catch(() => '');
      if (!cur) await phone.fill(input.profileData.phone).catch(() => undefined);
    }
  } catch { /* ignore */ }

  // Resume step: either upload a file, or pick an already-uploaded resume.
  try {
    const file = modal.locator('input[type="file"]').first();
    if (input.resumePath && (await file.count())) {
      await file.setInputFiles(input.resumePath).catch(() => undefined);
    } else {
      // LinkedIn often shows previously-uploaded resumes as radio choices; make
      // sure one is selected so the step can advance.
      const resumeRadios = modal.locator('input[type="radio"][name*="resume" i], input[type="radio"][id*="resume" i]');
      if ((await resumeRadios.count()) > 0) {
        const anyChecked = await modal.locator('input[type="radio"][name*="resume" i]:checked, input[type="radio"][id*="resume" i]:checked').count();
        if (!anyChecked) await resumeRadios.first().check().catch(() => undefined);
      }
    }
  } catch { /* ignore */ }

  // Screening questions: each is a grouping with a label + a control.
  const groups = modal.locator(
    'div.fb-dash-form-element, div[data-test-form-element], .jobs-easy-apply-form-section__grouping, fieldset[data-test-form-builder-radio-button-form-component]',
  );
  const count = await groups.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const g = groups.nth(i);
    let label = '';
    try {
      label = (await g.locator('label, legend, .fb-dash-form-element__label').first().innerText()).trim();
    } catch { /* no label */ }
    if (!label) continue;
    const answer = matchAnswer(label, input.formAnswers);
    const required = await fieldIsRequired(g);

    try {
      const select = g.locator('select').first();
      if (await select.count()) {
        if (answer) await select.selectOption({ label: answer }).catch(async () => { await select.selectOption(answer).catch(() => undefined); });
        else if (required) unanswered.push(label);
        continue;
      }
      const radios = g.locator('input[type="radio"]');
      if (await radios.count()) {
        if (answer) {
          const r = g.getByLabel(new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')).first();
          if (await r.count()) await r.check().catch(() => undefined);
          else if (required) unanswered.push(label);
        } else if (required) unanswered.push(label);
        continue;
      }
      const textarea = g.locator('textarea').first();
      if (await textarea.count()) {
        const cur = await textarea.inputValue().catch(() => '');
        if (!cur && answer) await textarea.fill(answer).catch(() => undefined);
        else if (!cur && required) unanswered.push(label);
        continue;
      }
      const text = g.locator('input[type="text"], input[type="number"], input:not([type])').first();
      if (await text.count()) {
        const cur = await text.inputValue().catch(() => '');
        if (!cur && answer) await text.fill(answer).catch(() => undefined);
        else if (!cur && required) unanswered.push(label);
        continue;
      }
    } catch (e: any) {
      log(`field "${label.slice(0, 40)}" skipped: ${e?.message ?? e}`);
    }
  }
}

export async function runLinkedInEasyApply(input: LinkedInApplyInput): Promise<LinkedInApplyResult> {
  const dryRun = input.dryRun ?? true;
  const logs: string[] = [];
  const log = (m: string) => { logs.push(m); console.log('[LinkedInApply]', m); };
  const evidenceId = input.evidenceId ?? `li-${Date.now()}`;

  const cookies = await getLinkedInCookies(input.userId);
  if (!cookies?.length) return { status: 'session_invalid', reason: 'no_session', logs };

  const context = await createIncognitoContext();
  try {
    await context.addCookies(cookies as any);
    const page: Page = await context.newPage();

    // Warm up the session on the feed first - navigating straight to a job URL
    // with a freshly-injected session can redirect-loop (ERR_TOO_MANY_REDIRECTS),
    // whereas the feed establishes the session cleanly.
    try {
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e: any) {
      log(`feed warm-up failed: ${e?.message ?? e}`);
    }
    if (/\/(login|authwall|uas\/login|checkpoint)/i.test(page.url())) {
      await markLinkedInSessionExpired(input.userId);
      log('Feed redirected to login - session expired.');
      return { status: 'session_invalid', reason: 'session_expired', logs };
    }

    // Session is valid - re-capture cookies to extend its life. LinkedIn rotates
    // session cookies; re-saving them on each successful use keeps the stored
    // session fresh (avoids it silently expiring between applies).
    try {
      const fresh = await context.cookies('https://www.linkedin.com');
      if (fresh.some((c) => c.name === 'li_at' && c.value)) {
        await setLinkedInSession(input.userId, fresh.map((c) => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          secure: c.secure, httpOnly: c.httpOnly, sameSite: (c.sameSite as any) ?? 'None',
        })));
        log('refreshed stored session cookies');
      }
    } catch { /* ignore */ }

    try {
      await page.goto(normalizeLinkedInUrl(input.jobUrl), { waitUntil: 'domcontentloaded', timeout: 35000 });
    } catch (e: any) {
      if (/ERR_TOO_MANY_REDIRECTS|redirect/i.test(String(e?.message ?? ''))) {
        await markLinkedInSessionExpired(input.userId);
        log('Job page redirect loop - session likely needs reconnecting.');
        return { status: 'session_invalid', reason: 'redirect_loop', logs };
      }
      throw e;
    }

    if (/\/(login|authwall|uas\/login)/i.test(page.url())) {
      await markLinkedInSessionExpired(input.userId);
      return { status: 'session_invalid', reason: 'redirected_to_login', logs };
    }
    if (await isCheckpoint(page)) {
      const shot = await page.screenshot().catch(() => undefined);
      const screenshotPath = shot ? await saveEvidenceScreenshot(evidenceId, shot, 'linkedin_checkpoint') : undefined;
      log('LinkedIn security checkpoint/CAPTCHA detected.');
      return { status: 'checkpoint', reason: 'security_checkpoint', screenshotPath, logs };
    }

    // Detect Easy Apply (vs an external "Apply" that opens a new tab).
    const easyBtn = page.locator('button.jobs-apply-button, button[aria-label*="Easy Apply" i]')
      .filter({ hasText: /easy apply/i }).first();
    let isEasy = (await easyBtn.count()) > 0;
    if (!isEasy) {
      const anyApply = page.locator('button.jobs-apply-button').first();
      if (await anyApply.count()) {
        const t = await anyApply.innerText().catch(() => '');
        isEasy = /easy apply/i.test(t);
      }
    }
    if (!isEasy) {
      // External "Apply" capture the destination URL so the worker can hand off
      // to the right ATS engine (Greenhouse/Lever/Ashby/SmartRecruiters…).
      log('No Easy Apply - capturing external apply URL.');
      const externalUrl = await captureExternalApplyUrl(page, input.jobUrl, log);
      if (externalUrl) { log(`External apply URL: ${externalUrl}`); return { status: 'external_apply', externalUrl, logs }; }
      log('Could not capture external apply URL.');
      return { status: 'not_easy_apply', logs };
    }

    await easyBtn.click();
    await page.waitForTimeout(1800);
    const modal = page.locator('div.jobs-easy-apply-modal, div[role="dialog"]').first();
    if (!(await modal.count())) { log('Easy Apply modal did not open.'); return { status: 'failed', reason: 'modal_not_opened', logs }; }

    const unanswered: string[] = [];
    let steps = 0;
    for (; steps < 12; steps++) {
      if (await isCheckpoint(page)) {
        const shot = await page.screenshot().catch(() => undefined);
        const screenshotPath = shot ? await saveEvidenceScreenshot(evidenceId, shot, 'linkedin_checkpoint') : undefined;
        log('Security checkpoint appeared mid-application.');
        return { status: 'checkpoint', reason: 'security_checkpoint', steps, screenshotPath, logs };
      }
      await fillStep(modal, input, unanswered, log);

      const submitBtn = modal.locator('button[aria-label="Submit application"], button:has-text("Submit application")').first();
      if (await submitBtn.count()) {
        if (dryRun) {
          const shot = await page.screenshot({ fullPage: false }).catch(() => undefined);
          const screenshotPath = shot ? await saveEvidenceScreenshot(evidenceId, shot, 'linkedin_dryrun') : undefined;
          log(`Reached Submit after ${steps + 1} step(s) - DRY RUN, not submitting.`);
          return { status: unanswered.length ? 'needs_review' : 'dry_run', steps: steps + 1, unanswered, screenshotPath, logs };
        }
        if (unanswered.length) {
          const shot = await page.screenshot().catch(() => undefined);
          const screenshotPath = shot ? await saveEvidenceScreenshot(evidenceId, shot, 'linkedin_needs_review') : undefined;
          log(`Reached Submit but ${unanswered.length} required question(s) unanswered - pausing for review.`);
          return { status: 'needs_review', steps: steps + 1, unanswered, screenshotPath, logs };
        }
        await submitBtn.click();
        await page.waitForTimeout(2500);
        const shot = await page.screenshot().catch(() => undefined);
        const screenshotPath = shot ? await saveEvidenceScreenshot(evidenceId, shot, 'linkedin_submitted') : undefined;
        log('Submitted.');
        return { status: 'submitted', steps: steps + 1, screenshotPath, logs };
      }

      const nextBtn = modal.locator(
        'button[aria-label="Continue to next step"], button[aria-label="Review your application"], button:has-text("Review"), button:has-text("Next")',
      ).first();
      if (await nextBtn.count()) { await nextBtn.click(); await page.waitForTimeout(1300); continue; }

      log('No Next/Submit button found - stopping.');
      break;
    }

    const shot = await page.screenshot().catch(() => undefined);
    const screenshotPath = shot ? await saveEvidenceScreenshot(evidenceId, shot, 'linkedin_incomplete') : undefined;
    return { status: unanswered.length ? 'needs_review' : 'failed', steps, unanswered, screenshotPath, logs };
  } catch (e: any) {
    log(`Error: ${e?.message ?? e}`);
    return { status: 'failed', reason: e?.message ?? 'error', logs };
  } finally {
    await context.close().catch(() => undefined);
  }
}
