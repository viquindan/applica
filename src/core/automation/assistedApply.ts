import type { PlatformAdapter } from '../platforms/PlatformAdapter';
import { launchHeadfulBrowser, launchRealBrowserContext } from './browserManager';
import { saveEvidenceScreenshot } from './evidenceSaver';
import { fillEverythingKnown } from '../platforms/universalFill';
import type { ApplyContext } from './applyEngine';

/**
 * Assisted apply: open the offer in a VISIBLE browser on the user's own machine,
 * pre-fill the whole form, and leave the window open so the user only solves the
 * CAPTCHA and clicks submit. Watches for a submission confirmation (or the user
 * closing the window) and reports the outcome. We never solve the CAPTCHA.
 */
export type AssistedOutcome = {
  status: 'submitted' | 'window_closed' | 'window_timeout' | 'error';
  reason?: string;
  logs?: Array<{ level: string; message: string; timestamp: string }>;
  screenshotPath?: string;
  /** Silent learning: what the form ended up containing (questionanswer), so the
   * worker can save new answers to the user's bank and reuse them next time. */
  capturedAnswers?: Record<string, string>;
};

// Don't re-capture standard profile fields (already known from the profile). We DO
// capture everything else - including demographics/EEOC - since the user needs those
// reused on future applications too.
const KNOWN_LABEL = /^\s*(first|last|full)?\s*name\s*$|e-?mail|phone|tel[eé]fono|resume|cv\b|curriculum|cover letter|carta/i;

/** Read the form's current questionanswer pairs from the page (what the user + we
 * filled), skipping sensitive and already-known fields. Used for silent learning. */
async function readFormAnswers(page: import('playwright').Page): Promise<Record<string, string>> {
  const pairs: { label: string; value: string }[] = await page.evaluate(() => {
    const out: { label: string; value: string }[] = [];
    const seen = new Set<string>();
    // Walk into open shadow roots - SmartRecruiters renders every field (including
    // things the user types, like "Institution") inside shadow DOM, invisible to a
    // plain querySelectorAll. That's why typed answers like "Bloomberg" never made
    // it into the answer bank: this reader saw zero fields there to begin with.
    const roots: (Document | ShadowRoot)[] = [document];
    const all: Element[] = [];
    while (roots.length) {
      const root = roots.shift()!;
      root.querySelectorAll('input, select, textarea').forEach((e) => all.push(e));
      root.querySelectorAll('*').forEach((e) => { if ((e as any).shadowRoot) roots.push((e as any).shadowRoot); });
    }
    for (const el of all) {
      const i = el as HTMLInputElement;
      if (['hidden', 'file', 'submit', 'button', 'password'].includes(i.type)) continue;
      if (i.type === 'radio' || i.type === 'checkbox') {
        if (seen.has(i.name)) continue;
        seen.add(i.name);
        const qc = i.closest('[class*="field" i], [class*="question" i], fieldset');
        let qlabel = qc?.querySelector('legend, [class*="label" i], .text') ? (qc.querySelector('legend, [class*="label" i], .text') as HTMLElement).innerText : '';
        qlabel = (qlabel || i.getAttribute('aria-label') || '').replace(/\s+/g, ' ').replace(/[✱*]/g, '').trim();
        if (!qlabel || qlabel.length > 160) continue;
        const grp = Array.from(document.querySelectorAll('input[name="' + i.name.replace(/"/g, '') + '"]')) as HTMLInputElement[];
        const picks: string[] = [];
        for (const g of grp) {
          if (!g.checked) continue;
          let ol = '';
          if (g.id) { const lf = document.querySelector('label[for="' + g.id.replace(/"/g, '') + '"]'); if (lf) ol = (lf as HTMLElement).innerText || ''; }
          if (!ol) { const cl = g.closest('label'); if (cl) ol = (cl as HTMLElement).innerText || ''; }
          ol = (ol || g.value || '').replace(/\s+/g, ' ').trim();
          if (ol && ol.toLowerCase() !== 'on') picks.push(ol); else if (grp.length === 1) picks.push('Yes');
        }
        if (picks.length) out.push({ label: qlabel, value: picks.join(', ') });
      } else {
        // Shadow-crossing label lookup inline (same trick as universalFill.ts): the
        // label can live in the outer light DOM while the input is inside a
        // component's shadow root - climb out through each shadow boundary.
        let label = '';
        let node: any = i;
        for (let hop = 0; hop < 4 && !label && node; hop++) {
          const root: any = node.getRootNode ? node.getRootNode() : document;
          if (node.id && root.querySelector) { const l = root.querySelector('label[for="' + node.id.replace(/"/g, '') + '"]'); if (l) label = l.innerText; }
          if (!label && node.closest) { const w = node.closest('label'); if (w) label = w.innerText; }
          if (!label && node.getAttribute) label = node.getAttribute('aria-label') || '';
          if (!label && node.closest) { const grp = node.closest('[class*="field" i], [class*="question" i], fieldset, li'); if (grp) { const l = grp.querySelector('label, legend, [class*="label" i], .text'); if (l) label = l.innerText; } }
          if (!label && node.placeholder) label = node.placeholder;
          node = root && root.host ? root.host : null;
        }
        label = (label || i.getAttribute('aria-label') || i.placeholder || '').replace(/\s+/g, ' ').replace(/[✱*]/g, '').trim();
        if (!label || label.length > 160) continue;
        let v = (i.value || '').trim();
        // Committed combobox picks (react-select) live in a SIBLING single/multi
        // value div while the input stays empty - without this walk, everything
        // the user chose from a list (deal size, hunting vs expansion...) was
        // invisible to learning and never reached the bank.
        if (!v) {
          let anc: any = i.parentElement;
          for (let up = 0; up < 4 && anc && !v; up++) {
            const sv = anc.querySelector && anc.querySelector('[class*="single-value" i], [class*="multi-value" i]');
            if (sv) v = ((sv as HTMLElement).textContent || '').replace(/\s+/g, ' ').trim();
            anc = anc.parentElement;
          }
        }
        if (v) out.push({ label, value: v });
      }
    }
    return out;
  }).catch(() => []);

  const answers: Record<string, string> = {};
  for (const { label, value } of pairs) {
    if (KNOWN_LABEL.test(label)) continue;
    if (value.length > 2000) continue;
    answers[label] = value;
  }
  return answers;
}

/** Read the capture written to sessionStorage by the injected WINDOW_CAPTURE script
 *  (set on submit, before navigation). More reliable than DOM snapshots. */
async function readCaptured(page: import('playwright').Page): Promise<Record<string, string>> {
  const raw = await page.evaluate(() => { try { return sessionStorage.getItem('__applica_cap'); } catch { return null; } }).catch(() => null);
  let obj: Record<string, unknown> = {};
  try { obj = raw ? JSON.parse(raw) : {}; } catch { obj = {}; }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v && !KNOWN_LABEL.test(k) && v.length <= 2000) out[k] = v;
  }
  return out;
}

/** Is a human-verification challenge visibly on screen? While it is, ALL of our
 * automated actions must pause: the per-tick refill types/clicks and steals focus
 * from the challenge (hCaptcha image grids especially), which both breaks the
 * user's solving flow and looks exactly like bot behavior to the anti-bot. */
async function captchaVisible(page: import('playwright').Page): Promise<boolean> {
  // VISIBILITY, not existence: solving an hCaptcha only HIDES its challenge
  // iframe - the frame stays in the tree, so a frames()-based check (or a plain
  // "is the iframe in the DOM" check) stays true forever after the first
  // challenge and the pause never lifts. The iframe must be actually displayed
  // (offsetParent + real size) to count.
  return page.evaluate(() => {
    const roots: (Document | ShadowRoot)[] = [document];
    const frames: HTMLElement[] = [];
    while (roots.length) {
      const r = roots.shift()!;
      r.querySelectorAll('iframe[src*="hcaptcha"], iframe[src*="recaptcha"][src*="bframe"], iframe[src*="funcaptcha"], iframe[src*="arkose"], iframe[src*="turnstile"], iframe[title*="challenge" i]')
        .forEach((e) => frames.push(e as HTMLElement));
      r.querySelectorAll('*').forEach((e) => { if ((e as any).shadowRoot) roots.push((e as any).shadowRoot); });
    }
    for (const f of frames) {
      // NO offsetParent here: challenge overlays are position:fixed, and FIXED
      // elements report offsetParent === null even while fully visible (that
      // check made the detector blind to the open challenge). display:none is
      // covered by the rect being 0x0; visibility inherits from ancestors.
      const st = window.getComputedStyle(f);
      if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
      const r = f.getBoundingClientRect();
      if (r.width > 60 && r.height > 60) return true;
    }
    const t = (document.body && document.body.innerText || '').toLowerCase();
    return /no a un robot|nos aseguramos de que|verify (you are|you're) human|i'?m not a robot|desliza|slide to|press ?& ?hold|reto de seguridad|security check|completa(r)? el patr[oó]n|complete the (pattern|puzzle)|arrastra|drag (the|each|to)|security code|verification code|c[oó]digo de (seguridad|verificaci[oó]n)|enter (the|your) code|sent (you )?a (security |verification )?code|one[- ]?time (code|password|passcode)|introduce (el|tu) c[oó]digo|hemos enviado un c[oó]digo|check your (e-?mail|inbox) for/i.test(t);
  }).catch(() => false);
}

/** Count required fields still unanswered (visible, incl. shadow DOM): empty
 * text/select/textarea, required file inputs with nothing attached, required
 * checkboxes unchecked. Zero missing + no captcha = safe to auto-advance. */
async function missingRequiredCount(page: import('playwright').Page): Promise<number> {
  return page.evaluate(() => {
    const roots: (Document | ShadowRoot)[] = [document];
    const els: Element[] = [];
    while (roots.length) {
      const r = roots.shift()!;
      r.querySelectorAll('input, select, textarea').forEach((e) => els.push(e));
      r.querySelectorAll('*').forEach((e) => { if ((e as any).shadowRoot) roots.push((e as any).shadowRoot); });
    }
    let n = 0;
    for (const el of els as HTMLInputElement[]) {
      const ty = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(ty)) continue;
      if (el.offsetParent === null || el.disabled) continue;
      const req = el.required || el.getAttribute('aria-required') === 'true';
      if (!req) continue;
      if (ty === 'file') { if (!el.files || el.files.length === 0) n++; continue; }
      if (ty === 'checkbox') { if (!el.checked) n++; continue; }
      if (ty === 'radio') { const grp = document.querySelectorAll('input[name="' + (el.name || '').replace(/"/g, '') + '"]'); let any = false; grp.forEach((g) => { if ((g as HTMLInputElement).checked) any = true; }); if (!any) n++; continue; }
      if (!((el.value || '').trim())) n++;
    }
    return n;
  }).catch(() => 1); // on doubt, treat as incomplete (never auto-advance blind)
}

/** Click the ATS's own Next/Submit button (role-exact, buttons only - never a
 * link, never third-party "Apply with Indeed/LinkedIn"). Returns what it clicked. */
async function clickAdvance(page: import('playwright').Page): Promise<'submit' | 'next' | null> {
  // isVisible + click-success required: a HIDDEN button from a previous page still
  // counts()/isEnabled(), and a failed click must report null (not a phantom
  // success that burns the attempt budget).
  const submit = page.getByRole('button', { name: /^\s*(submit( application)?|send application|enviar( solicitud)?|postular)\s*$/i }).first();
  if (await submit.isVisible().catch(() => false) && await submit.isEnabled().catch(() => false)) {
    if (process.env.ENABLE_REAL_SUBMISSIONS !== 'true') return null; // leave the final click to the user
    const ok = await submit.click({ timeout: 4000 }).then(() => true).catch(() => false);
    return ok ? 'submit' : null;
  }
  const next = page.getByRole('button', { name: /^\s*(next|siguiente|pr[oó]ximo|continue|continuar)\s*$/i }).first();
  if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) {
    const ok = await next.click({ timeout: 4000 }).then(() => true).catch(() => false);
    return ok ? 'next' : null;
  }
  return null;
}

const SUCCESS_TEXT = /thank you( for applying)?|application (was )?(submitted|received|complete|sent)|your application has been (submitted|received)|thanks for (applying|your interest)|we('| ha)ve received your|successfully (submitted|applied)|gracias por (aplicar|postular|tu inter[eé]s)|hemos recibido tu|(solicitud|postulaci[oó]n|aplicaci[oó]n) (enviada|recibida|completada)/i;
const SUCCESS_URL = /confirmation|thank|submitted|success|complete|applied/i;
// Selectors that mean "the application form is still on screen".
const FORM_PRESENT = 'button:has-text("Submit"), button:has-text("Enviar"), input[type="submit"], #_systemfield_name, input[name="_systemfield_name"], input[name="name"], input[name="email"]';

/**
 * Try to submit in the user's REAL browser (trusted fingerprint invisible
 * captchas often pass silently). If it auto-submits, great (`auto: true`). If a
 * visible challenge appears instead, leave the window open and watch for the user
 * to finish. Returns null-browser error if no local browser is available.
 */
export async function runRealBrowserApply(
  adapter: PlatformAdapter,
  url: string,
  contextData: Omit<ApplyContext, 'page' | 'fillOnly'>,
  opts?: { timeoutMs?: number; onChallenge?: () => void },
): Promise<AssistedOutcome & { auto?: boolean }> {
  const timeoutMs = opts?.timeoutMs ?? 15 * 60 * 1000;
  const logs: AssistedOutcome['logs'] = [];
  const log = (message: string) => { console.log(`[RealApply] ${message}`); logs!.push({ level: 'info', message, timestamp: new Date().toISOString() }); };

  // Distinguish "couldn't LAUNCH the real browser" (no_local_browser /
  // launch_failed: the only cases where falling back to the bundled Chromium
  // makes sense) from errors that happen INSIDE the real browser afterwards
  // (adapter timeouts etc.), where the fallback would silently move the user to
  // a browser without their sessions.
  let context;
  try {
    context = await launchRealBrowserContext();
  } catch (e: any) {
    return { status: 'error', reason: `launch_failed: ${e?.message ?? e}`, logs };
  }
  if (!context) return { status: 'error', reason: 'no_local_browser', logs };
  let closed = false;
  // Catch the submit the instant the page navigates to a confirmation - so even if
  // the user closes the window immediately after submitting, we already know it went
  // through (avoids re-launching a "not submitted" application).
  let everSuccess = false;
  // Hoisted OUTSIDE the try so the catch block (closing the window almost always
  // throws "Target/context closed" from Playwright) can still return what was
  // learned - previously this lived inside the try and got silently dropped on
  // close, so nothing typed by the user (e.g. "Bloomberg" as a certification
  // institution) ever reached the reusable-answer bank.
  let lastSnapshot: Record<string, string> = {};
  let positiveSeen = false;
  context.on('close', () => { closed = true; });
  // NEVER reuse the persistent profile's INITIAL page: context.addInitScript
  // does not attach to it (verified live: banner + WINDOW_CAPTURE reported
  // init=no there - no banner for the user AND zero silent learning). A page
  // created AFTER registration gets every init script.
  const preexisting = context.pages();
  const page = await context.newPage();
  for (const p of preexisting) await p.close().catch(() => {});
  page.on('close', () => { closed = true; });
  page.on('framenavigated', (frame) => {
    try {
      if (frame === page.mainFrame()) {
        const u = frame.url();
        if (SUCCESS_URL.test(u) && !/\/apply(\/)?$|\/application(\/)?$/.test(u)) everSuccess = true;
      }
    } catch { /* ignore */ }
  });

  try {
    // All ATS attempt the real submit: fill + click the ATS's OWN submit button. If
    // there's no captcha it auto-applies; if a human challenge appears, we hand off.
    // (SmartRecruiters' submit is now role-exact so it never hits "Apply with Indeed".)
    const result = await adapter.applyPlaywright?.(url, { ...contextData, page, fillOnly: false } as ApplyContext);
    for (const l of result?.logs ?? []) logs!.push(l as any);
    // Filling done → switch the in-page banner to "your turn".
    await page.evaluate(() => (window as any).__applicaSetPhase?.('ready')).catch(() => {});

    if (result?.status === 'submitted') {
      const captured = await readCaptured(page);
      const buf = await page.screenshot({ fullPage: true }).catch(() => null);
      const screenshotPath = buf ? await saveEvidenceScreenshot(contextData.applicationId, buf, 'success') : undefined;
      log(`Envío AUTOMÁTICO confirmado (el captcha invisible pasó en tu navegador real). Capturadas ${Object.keys(captured).length} respuestas.`);
      await page.waitForTimeout(3000);
      return { status: 'submitted', reason: 'auto', auto: true, logs, screenshotPath, capturedAnswers: captured };
    }

    // Diagnostic: report the banner's real state inside the USER's browser (it
    // renders fine in synthetic runs but the user reports it missing in Brave).
    const bannerState = await page.evaluate(() => {
      const b = document.getElementById('__applica_bar');
      if (!b) return `ausente (readyState=${document.readyState}, init=${(window as any).__applicaBannerInit ? 'si' : 'no'})`;
      const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
      return `presente pos=${cs.position} top=${Math.round(r.top)} h=${Math.round(r.height)} display=${cs.display} visibility=${cs.visibility}`;
    }).catch((e: any) => `error: ${e?.message ?? e}`);
    log(`Banner en la ventana: ${bannerState}`);

    // Visible challenge or no confirmation: leave the window for the user, and watch.
    // We consider it SUBMITTED when a confirmation shows OR (having seen the form)
    // the form is gone - Ashby/Greenhouse/Lever replace it with a thank-you view on
    // a successful submit. Meanwhile we keep the latest captured answers.
    log('Ventana lista. Espero a que completes y envíes.');
    const start = Date.now();
    let sawForm = false;
    let advanceAttempts = 0;
    let lastAdvanceAt = 0;
    let challengeSeen = false;
    while (Date.now() - start < timeoutMs) {
      if (closed || !context.pages().length) {
        // If we already saw the confirmation navigation, the user DID submit before
        // closing - mark it submitted (don't leave it re-launchable).
        if (everSuccess) { log('Envío detectado antes de cerrar la ventana.'); return { status: 'submitted', reason: 'user', logs, capturedAnswers: lastSnapshot }; }
        log('Ventana cerrada por el usuario.');
        return { status: 'window_closed', logs, capturedAnswers: lastSnapshot };
      }

      // Multi-page ATS (SmartRecruiters splits the application across several
      // steps): our adapter only fills the page it started on, then hands off. When
      // the user clicks "Next" a fresh page of questions appears with nobody
      // filling it. fillEverythingKnown only ever touches EMPTY recognized fields,
      // so re-running it every tick is safe (idempotent, no clobbering) and turns
      // the one-shot fill into "bot fills -> human handles captcha/unknowns -> Next
      // -> bot fills the new page -> repeat" until the final submit.
      // FROZEN while a captcha challenge is visible: typing/clicking mid-challenge
      // steals focus from the user solving it AND reads as bot activity to the
      // anti-bot. The bot only watches until the challenge is gone.
      const challengeUp = await captchaVisible(page);
      if (challengeUp && !challengeSeen) { challengeSeen = true; log('[auto] Captcha detectado: Applica en pausa; el usuario tiene el control.'); opts?.onChallenge?.(); }
      if (!challengeUp) {
        try {
          const n = await fillEverythingKnown(page, contextData.profileData, contextData.formAnswers ?? {}, (m) => log(`[auto] ${m}`));
          if (n) await page.evaluate(() => (window as any).__applicaSetPhase?.('ready')).catch(() => {});
        } catch { /* a new page's DOM mid-transition can throw; just retry next tick */ }

        // Auto-advance: no captcha + every required field answered = click the
        // ATS's own Next/Submit ourselves (the user only ever intervenes for a
        // captcha or a genuinely unknown answer). Cooldown + attempt cap so a
        // failing validation never turns into button-hammering.
        // DISABLED for the rest of the run once a challenge has appeared: solving
        // it usually completes the pending submit on its own, and re-clicking
        // Enviar just spawns a FRESH challenge - an infinite bot-vs-captcha loop
        // fighting the user. Once a captcha shows up, advancing is human territory.
        if (!challengeSeen && advanceAttempts < 6 && Date.now() - lastAdvanceAt > 8000) {
          const missing = await missingRequiredCount(page);
          if (missing === 0) {
            const clicked = await clickAdvance(page);
            if (clicked) {
              advanceAttempts++;
              lastAdvanceAt = Date.now();
              log(`[auto] Todo completo y sin captcha: clic en ${clicked === 'submit' ? 'Enviar' : 'Siguiente'} (intento ${advanceAttempts}).`);
              await page.waitForTimeout(2500); // let the new page/confirmation render
            }
          }
        }
      }

      // Keep the latest answers (from the injected capture, plus a DOM read fallback).
      const cap = await readCaptured(page);
      if (Object.keys(cap).length) lastSnapshot = { ...lastSnapshot, ...cap };
      else { const snap = await readFormAnswers(page); if (Object.keys(snap).length) lastSnapshot = { ...lastSnapshot, ...snap }; }

      const bodyText = await page.locator('body').innerText().catch(() => '');
      const u = page.url();
      const formHere = (await page.locator(FORM_PRESENT).count().catch(() => 1)) > 0;
      if (formHere) sawForm = true;

      // The form disappearing can mean SUCCESS (thank-you) OR a block (e.g. the
      // company's application limit, "no longer accepting"). Distinguish them.
      const blockedText = /application limit|reached (this|the|your) limit|limit (of|has been) reached|no longer accepting|not accepting applications|already applied|too many (requests|applications)|no est[aá] disponible|l[ií]mite de (aplicaci|postulaci)|has alcanzado/i;
      const isBlocked = blockedText.test(bodyText);
      const positiveConfirm = everSuccess || SUCCESS_TEXT.test(bodyText)
        || (SUCCESS_URL.test(u) && !/\/apply(\/)?$|\/application(\/)?$/.test(u));
      // NEVER conclude from "the form disappeared" while a human-verification
      // step is on screen: Greenhouse's email OTP replaces the form with the
      // code prompt, which read as success and CLOSED the window while the user
      // was fetching the code from their inbox.
      const formGoneClean = sawForm && !formHere && Object.keys(lastSnapshot).length > 0 && !isBlocked && !challengeUp;

      if (isBlocked && !positiveConfirm) {
        const buf = await page.screenshot({ fullPage: true }).catch(() => null);
        const screenshotPath = buf ? await saveEvidenceScreenshot(contextData.applicationId, buf, 'failure') : undefined;
        log('La empresa bloqueó el envío (límite de aplicaciones / no acepta). NO se marca como enviada.');
        return { status: 'error', reason: 'site_limit', logs, screenshotPath, capturedAnswers: lastSnapshot };
      }
      if (positiveConfirm || formGoneClean) {
        positiveSeen = true;
        const buf = await page.screenshot({ fullPage: true }).catch(() => null);
        const screenshotPath = buf ? await saveEvidenceScreenshot(contextData.applicationId, buf, 'success') : undefined;
        log(`Envío detectado. Capturadas ${Object.keys(lastSnapshot).length} respuestas.`);
        await page.waitForTimeout(2500);
        return { status: 'submitted', reason: 'user', logs, screenshotPath, capturedAnswers: lastSnapshot };
      }
      await page.waitForTimeout(2000);
    }
    return { status: 'window_timeout', logs, capturedAnswers: lastSnapshot };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    // The user closing the window makes Playwright throw "Target/context/browser
    // has been closed". That is NOT a real-browser failure - do NOT report 'error'
    // (which would make the worker RE-LAUNCH a second window). Treat it as a normal
    // close: submitted if we already saw the confirmation, else just closed. Always
    // carry lastSnapshot/capturedAnswers - it's hoisted above the try precisely so
    // this path (the common one) doesn't lose what the user typed.
    if (closed || /closed|Target page|browser has been closed|Execution context/i.test(msg)) {
      if (everSuccess || positiveSeen) { log('Envío detectado; la ventana se cerró.'); return { status: 'submitted', reason: 'user', logs, capturedAnswers: lastSnapshot }; }
      log('El usuario cerró la ventana.');
      return { status: 'window_closed', logs, capturedAnswers: lastSnapshot };
    }
    log(`Error en apply con navegador real: ${msg}`);
    return { status: 'error', reason: msg, logs, capturedAnswers: lastSnapshot };
  } finally {
    await context.close().catch(() => {});
  }
}

export async function runAssistedApply(
  adapter: PlatformAdapter,
  url: string,
  contextData: Omit<ApplyContext, 'page' | 'fillOnly'>,
  opts?: { timeoutMs?: number; display?: string; onChallenge?: () => void },
): Promise<AssistedOutcome> {
  const timeoutMs = opts?.timeoutMs ?? 15 * 60 * 1000;
  const logs: AssistedOutcome['logs'] = [];
  const log = (message: string) => { console.log(`[Assisted] ${message}`); logs!.push({ level: 'info', message, timestamp: new Date().toISOString() }); };

  const { browser, context } = await launchHeadfulBrowser({ display: opts?.display });
  let closed = false;
  browser.on('disconnected', () => { closed = true; });
  context.on('close', () => { closed = true; });

  const page = await context.newPage();
  page.on('close', () => { closed = true; });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Pre-fill everything (no submit). If it partially fails, we STILL leave the
    // window open - the user can finish manually on an already-opened offer.
    try {
      const fill = await adapter.applyPlaywright?.(url, { ...contextData, page, fillOnly: true } as ApplyContext);
      for (const l of fill?.logs ?? []) logs!.push(l as any);
      await page.evaluate(() => (window as any).__applicaSetPhase?.('ready')).catch(() => {});
      log('Formulario pre-llenado. Ventana lista para el usuario.');
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      log(`Pre-llenado incompleto (${msg}).`);
      // If the tab crashed (e.g. hCaptcha/WebGL), reload so the user gets a working
      // offer page instead of an "Aw, Snap" screen - they can then apply manually.
      if (/target crashed|page crashed|detached/i.test(msg)) {
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }); log('Página recargada tras crash - oferta lista para completar manualmente.'); }
        catch { log('No se pudo recargar tras el crash.'); }
      }
    }

    // Watch until the user submits (confirmation) or closes the window.
    const start = Date.now();
    let advanceAttempts = 0;
    let lastAdvanceAt = 0;
    let challengeSeen = false;
    while (Date.now() - start < timeoutMs) {
      if (closed || !browser.isConnected() || context.pages().length === 0) {
        log('El usuario cerró la ventana.');
        return { status: 'window_closed', logs };
      }
      // Same multi-page auto-refill as the real-browser path (see there for why),
      // and same freeze while a captcha challenge is on screen.
      const challengeUp = await captchaVisible(page);
      if (challengeUp && !challengeSeen) opts?.onChallenge?.();
      if (challengeUp) challengeSeen = true;
      if (!challengeUp) {
        try { await fillEverythingKnown(page, contextData.profileData, contextData.formAnswers ?? {}, (m) => log(`[auto] ${m}`)); } catch { /* mid-transition DOM; retry next tick */ }
        // Same auto-advance as the real-browser path (also disabled after any captcha).
        if (!challengeSeen && advanceAttempts < 6 && Date.now() - lastAdvanceAt > 8000) {
          if ((await missingRequiredCount(page)) === 0) {
            const clicked = await clickAdvance(page);
            if (clicked) { advanceAttempts++; lastAdvanceAt = Date.now(); log(`[auto] Todo completo y sin captcha: clic en ${clicked === 'submit' ? 'Enviar' : 'Siguiente'}.`); await page.waitForTimeout(2500); }
          }
        }
      }
      const bodyText = await page.locator('body').innerText().catch(() => '');
      const u = page.url();
      if (SUCCESS_TEXT.test(bodyText) || (SUCCESS_URL.test(u) && !/\/apply(\/)?$|\/application(\/)?$/.test(u))) {
        const buf = await page.screenshot({ fullPage: true }).catch(() => null);
        const screenshotPath = buf ? await saveEvidenceScreenshot(contextData.applicationId, buf, 'success') : undefined;
        log('Envío confirmado por el usuario.');
        await page.waitForTimeout(4000); // let the user see the confirmation
        return { status: 'submitted', reason: 'Confirmación detectada', logs, screenshotPath };
      }
      await page.waitForTimeout(3000);
    }
    log('Se agotó el tiempo de la ventana asistida.');
    return { status: 'window_timeout', logs };
  } catch (e: any) {
    log(`Error en apply asistido: ${e?.message ?? e}`);
    return { status: 'error', reason: e?.message ?? 'error', logs };
  } finally {
    await browser.close().catch(() => {});
  }
}
