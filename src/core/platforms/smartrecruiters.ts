import { PlatformAdapter, SearchFilters } from './PlatformAdapter';
import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';
import { inferModality } from '../scoring/geography';
import { filterRankLimit, mapWithConcurrency, stripHtml } from './atsSearchHelpers';
import { fillEverythingKnown } from './universalFill';

/**
 * SmartRecruiters public Posting API adapter (discovery only for now).
 * Listing: https://api.smartrecruiters.com/v1/companies/{token}/postings
 * Detail: https://api.smartrecruiters.com/v1/companies/{token}/postings/{id}
 *
 * The listing has no description, so we only fetch detail pages for the top
 * candidates after filtering/ranking, keeping detail calls bounded by `limit`.
 */
export class SmartRecruitersAdapter implements PlatformAdapter {
  name = 'smartrecruiters';

  async search(filters: SearchFilters): Promise<NormalizedVacancy[]> {
    const boardTokens = filters.boardTokens ?? [];
    if (boardTokens.length === 0) return [];

    let scannedSources = 0;
    const listings = await mapWithConcurrency(boardTokens, 20, async (token) => {
      const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=100`);
      scannedSources += 1;
      if (filters.onProgress && (scannedSources % 100 === 0 || scannedSources === boardTokens.length)) {
        await filters.onProgress({ scannedSources, totalSources: boardTokens.length });
      }
      if (!res.ok) {
        console.warn(`[SmartRecruiters] Failed to fetch company ${token}: ${res.status}`);
        return [];
      }
      const data = await res.json();
      return (Array.isArray(data.content) ? data.content : []).map((job: any) => this.normalizeListing(job, token));
    });

    const ranked = filterRankLimit(listings.flat(), filters);

    // Enrich only the surviving candidates with full descriptions.
    return mapWithConcurrency(ranked, 10, async (job) => this.enrich(job));
  }

  async extractVacancy(url: string): Promise<NormalizedVacancy | null> {
    const match = url.match(/smartrecruiters\.com\/(?:v1\/companies\/)?([^/]+)\/(?:postings\/)?([^/?]+)/i);
    if (!match) return null;
    const [, token, id] = match;
    const detail = await this.fetchDetail(token, id);
    if (!detail) return null;
    return detail;
  }

  async apply(): Promise<Partial<ApplicationSubmission>> {
    throw new Error('[SmartRecruiters] Automated apply is not implemented yet. Apply manually via the posting URL.');
  }

  private normalizeListing(job: any, token: string): NormalizedVacancy {
    const loc = job.location ?? {};
    const locationLabel = loc.fullLocation || [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
    return {
      id: String(job.id),
      platform: this.name,
      externalId: String(job.id),
      title: job.name,
      company: job.company?.identifier || token,
      location: locationLabel,
      modality: loc.remote ? 'remote' : loc.hybrid ? 'hybrid' : inferModality(locationLabel),
      description: '',
      requirements: undefined,
      url: `https://jobs.smartrecruiters.com/${token}/${job.id}`,
      postedAt: job.releasedDate ? new Date(job.releasedDate) : undefined,
    };
  }

  private async enrich(job: NormalizedVacancy): Promise<NormalizedVacancy> {
    const match = job.url.match(/smartrecruiters\.com\/([^/]+)\/([^/?]+)/i);
    if (!match) return job;
    const detailed = await this.fetchDetail(match[1], match[2]);
    return detailed ?? job;
  }

  private async fetchDetail(token: string, id: string): Promise<NormalizedVacancy | null> {
    const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${token}/postings/${id}`);
    if (!res.ok) return null;
    const job = await res.json();
    const sections = job.jobAd?.sections ?? {};
    const description = stripHtml(
      [
        sections.companyDescription?.text,
        sections.jobDescription?.text,
        sections.additionalInformation?.text,
      ].filter(Boolean).join('\n'),
    );
    const requirements = sections.qualifications?.text ? stripHtml(sections.qualifications.text) : undefined;
    const loc = job.location ?? {};
    const locationLabel = loc.fullLocation || [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
    return {
      id: String(job.id),
      platform: this.name,
      externalId: String(job.id),
      title: job.name,
      company: job.company?.identifier || token,
      location: locationLabel,
      modality: loc.remote ? 'remote' : loc.hybrid ? 'hybrid' : inferModality(locationLabel),
      description,
      requirements,
      url: job.applyUrl || job.postingUrl || `https://jobs.smartrecruiters.com/${token}/${job.id}`,
      postedAt: job.releasedDate ? new Date(job.releasedDate) : undefined,
    };
  }

  /**
   * Best-effort SmartRecruiters application. Public form, no login. Defensive
   * selectors; gated by ENABLE_REAL_SUBMISSIONS (otherwise dry-run). Used both for
   * direct SmartRecruiters postings and as a LinkedIn external-apply handoff.
   */
  async applyPlaywright(url: string, context: import('../automation/applyEngine').ApplyContext): Promise<Partial<ApplicationSubmission>> {
    const { page, profileData, resumePath, formAnswers } = context;
    const logs: Array<{ timestamp: string; level: string; message: string }> = [];
    const log = (m: string) => { console.log(`[SmartRecruiters] ${m}`); logs.push({ timestamp: new Date().toISOString(), level: 'info', message: m }); };

    if (page.url() !== url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);

    // Reveal the application form: click ONLY the native "I'm interested" button.
    // Do NOT click "Apply with Indeed"/"Apply with LinkedIn" or a generic "Apply" -
    // those go to a third party (that's what filled the wrong form before).
    await page.waitForTimeout(1500);
    const interested = page.getByRole('button', { name: /^\s*i['’]?m interested\s*$/i }).first()
      .or(page.getByRole('link', { name: /^\s*i['’]?m interested\s*$/i }).first())
      .or(page.locator('button, a').filter({ hasText: /^\s*i['’]?m interested\s*$/i }).first());
    if (await interested.count()) {
      await interested.scrollIntoViewIfNeeded().catch(() => undefined);
      await interested.click().catch(() => undefined);
      log('Click en "I\'m interested" - cargando el formulario...');
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    } else {
      log('No encontré "I\'m interested" - no clickeo ningún "Apply" de terceros.');
    }

    // SmartRecruiters (SAP) can gate the form behind an anti-bot challenge
    // ("Nos aseguramos de que no eres un robot" slider) that the user solves by
    // hand. The form fields only appear AFTER that check passes, so don't fill on
    // a fixed timer - poll for a real field to show up (up to ~2.5 min) so we
    // fill AFTER the human clears the challenge, not before (empty page = no-op).
    const formField = page.locator('input[name="firstName"], #firstName, input[autocomplete="given-name"], input[type="email"], input[name="email"]').first();
    let formReady = false;
    for (let i = 0; i < 75; i++) {
      if (await formField.count().catch(() => 0)) { formReady = true; break; }
      if (i === 2) log('Esperando el formulario. Si SmartRecruiters te pide verificación (deslizar), resuélvela; luego yo lleno.');
      await page.waitForTimeout(2000);
    }
    if (formReady) log('Formulario visible - llenando.');
    else log('No apareció el formulario a tiempo (¿verificación sin resolver?).');

    const firstName = profileData.firstName || (profileData.name ? String(profileData.name).split(' ')[0] : '');
    const lastName = profileData.lastName || (profileData.name ? String(profileData.name).split(' ').slice(1).join(' ') : '');
    // Sanitize phone: some profiles store an email in the phone field; a tel input
    // rejects it. Fall back to a valid placeholder if it isn't phone-like.
    const rawPhone = String(profileData.phone || '');
    const phone = (rawPhone.replace(/\D/g, '').length >= 7) ? rawPhone : '+507 6000-0000';

    // Fill a field by the first matching selector, committing it (React needs
    // input/change/blur or it shows the value as empty/required).
    const fill = async (selectors: string[], val: string, label: string) => {
      if (!val) return;
      for (const sel of selectors) {
        const el = page.locator(sel).first();
        if (await el.count()) {
          await el.fill(val).catch(() => undefined);
          await el.evaluate((n) => { n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); (n as HTMLElement).blur(); }).catch(() => undefined);
          log(`Filled ${label}`);
          return;
        }
      }
    };
    // Resume FIRST. Uploading the CV makes SmartRecruiters autofill name/email/etc.
    // from the parsed resume, which RE-RENDERS the form and wipes anything typed
    // before it. So attach the CV up front, let the autofill settle, then fill our
    // fields on top (our values win, and confirm-email/LinkedIn/city aren't erased).
    // The CV field is a <spl-dropzone> (SAP lit element): only its native file
    // chooser registers a file - a raw setInputFiles on the shadow <input> is
    // silently ignored. So click the dropzone and answer the OS chooser.
    if (resumePath) {
      let attached = false;
      const dz = page.locator('spl-dropzone, [class*="dropzone" i]').first();
      if (await dz.count().catch(() => 0)) {
        try {
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 8000 }),
            dz.click({ timeout: 5000 }),
          ]);
          await chooser.setFiles(resumePath);
          await page.waitForTimeout(3500); // let SR parse + autofill + re-render
          attached = true;
          log('CV subido (file chooser del dropzone).');
        } catch { /* fall through to setInputFiles */ }
      }
      if (!attached) {
        const dzInput = page.locator('spl-dropzone input[type="file"], input[type="file"][accept*=".pdf"], input[type="file"][accept*=".doc"]').first();
        if (await dzInput.count().catch(() => 0)) {
          await dzInput.setInputFiles(resumePath).catch(() => undefined);
          await page.waitForTimeout(2500);
          attached = true;
          log('CV set en el input del dropzone (fallback).');
        }
      }
      if (!attached) log('No pude adjuntar el CV automáticamente - el usuario puede subirlo en la ventana.');
    }

    await fill(['input[name="firstName"]', '#firstName', 'input[autocomplete="given-name"]', 'input[aria-label*="First" i]'], firstName, 'first name');
    await fill(['input[name="lastName"]', '#lastName', 'input[autocomplete="family-name"]', 'input[aria-label*="Last" i]'], lastName, 'last name');
    // Fill EVERY email input (SR has "Email" + "Confirm email"), not just the first.
    if (profileData.email) {
      const emails = page.locator('input[type="email"], input[name*="mail" i], input[id*="mail" i], input[aria-label*="mail" i]');
      const en = await emails.count().catch(() => 0);
      for (let i = 0; i < en; i++) {
        const el = emails.nth(i);
        await el.fill(String(profileData.email)).catch(() => undefined);
        await el.evaluate((n) => { n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); (n as HTMLElement).blur(); }).catch(() => undefined);
      }
      if (en) log(`Filled ${en} email field(s) (incl. confirm)`);
    }
    await fill(['input[name="phoneNumber"]', '#phoneNumber', 'input[type="tel"]', 'input[autocomplete="tel"]', 'input[aria-label*="Phone" i]'], phone, 'phone');
    await fill(['input[name*="linkedin" i]', 'input[id*="linkedin" i]', 'input[placeholder*="linkedin" i]', 'input[aria-label*="linkedin" i]'], String(profileData.linkedin || ''), 'linkedin');

    // Country: SR renders it as a <select> or a typeahead input. Try both.
    const countryVal = String(profileData.country || '');
    if (countryVal) {
      const csel = page.locator('select[name*="country" i], select[id*="country" i], select[aria-label*="country" i]').first();
      if (await csel.count()) {
        await csel.selectOption({ label: countryVal }).catch(async () => { await csel.selectOption({ value: countryVal }).catch(() => undefined); });
        await csel.evaluate((n) => n.dispatchEvent(new Event('change', { bubbles: true }))).catch(() => undefined);
        log('Selected country');
      } else {
        await fill(['input[name*="country" i]', 'input[id*="country" i]', 'input[placeholder*="country" i]', 'input[aria-label*="country" i]'], countryVal, 'country');
      }
    }

    // City is a <spl-autocomplete> (input inside shadow DOM): you must TYPE (real
    // keystrokes, not fill()) to trigger its async city search, then pick a
    // suggestion - free text alone stays invalid ("Please provide your place of
    // residence"). Suggestions render in an overlay; select by matching text, else
    // fall back to keyboard (ArrowDown + Enter picks the first result).
    const cityVal = String(profileData.city || profileData.country || '');
    if (cityVal) {
      const cityInput = page.locator('spl-autocomplete input, input[name*="location" i], input[id*="location" i], input[placeholder*="city" i], input[placeholder*="location" i], input[aria-label*="city" i], input[aria-label*="location" i], input[aria-label*="residence" i]').first();
      if (await cityInput.count().catch(() => 0)) {
        await cityInput.click().catch(() => undefined);
        await cityInput.fill('').catch(() => undefined);
        await cityInput.pressSequentially(cityVal, { delay: 70 }).catch(() => undefined);
        await page.waitForTimeout(2800); // let the suggestion list load
        const match = page.locator('[role="option"], li, [class*="option" i], [class*="result" i], [class*="suggestion" i]').filter({ hasText: new RegExp(cityVal.split(' ')[0], 'i') }).first();
        if (await match.count().catch(() => 0)) { await match.click().catch(() => undefined); log('Selected city suggestion'); }
        else { await cityInput.press('ArrowDown').catch(() => undefined); await cityInput.press('Enter').catch(() => undefined); log('City picked via keyboard'); }
      }
    }

    for (const [q, a] of Object.entries(formAnswers ?? {})) {
      if (await this.fillQuestionByLabel(page, q, a)) log(`Filled "${q.slice(0, 40)}"`);
    }

    // Sweep EVERY remaining field and fill whatever we can recognize from the
    // profile + answer bank (confirm-email, country, LinkedIn, city, and any other
    // labeled field we know), instead of relying only on hardcoded selectors.
    await fillEverythingKnown(page, profileData, { ...(formAnswers ?? {}) }, log);

    // Required consent checkboxes (privacy policy etc.).
    const consents = page.locator('input[type="checkbox"][required], input[type="checkbox"][aria-required="true"]');
    const cn = await consents.count().catch(() => 0);
    for (let i = 0; i < cn; i++) await consents.nth(i).check().catch(() => undefined);

    // Assisted mode: form is filled - leave it for the user (captcha + submit).
    if (context.fillOnly) {
      log('Formulario lleno (modo asistido) - listo para que el usuario complete captcha + envíe.');
      return { status: 'pending_review', submissionStatus: 'assisted_ready', logs };
    }

    // Only SmartRecruiters' OWN submit button. NEVER "Apply with Indeed/LinkedIn"
    // or a generic "Apply" (those go to a third-party form).
    const submitBtn = page.getByRole('button', { name: /^\s*(submit( application)?|send application|enviar( solicitud)?)\s*$/i }).first()
      .or(page.locator('button[type="submit"]:has-text("Submit")').first());
    if (!(await submitBtn.count())) { log('Submit propio de SR no encontrado - dejo para el usuario.'); return { status: 'pending_review', submissionStatus: 'assisted_ready', logs }; }
    if (process.env.ENABLE_REAL_SUBMISSIONS === 'true') {
      await submitBtn.click().catch(() => undefined);
      await page.waitForTimeout(3500);
      const ok = (await page.locator('text=/thank you|application (received|submitted|complete)|gracias/i').count().catch(() => 0)) > 0;
      if (ok) { log('Submission confirmed'); return { status: 'submitted', submissionStatus: 'success', submittedAutomatically: true, logs }; }
      // If a human-verification challenge gates submit, hand off to assisted.
      const captcha = await page.evaluate(() =>
        typeof (window as any).grecaptcha !== 'undefined'
        || document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="funcaptcha"], iframe[src*="arkose"]').length > 0
        || /select (all|items|each)|verify you (are|’re) human|press & hold/i.test(document.body?.innerText || ''),
      ).catch(() => false);
      if (captcha) {
        log('Human-verification challenge on submit - form prepared; handing off.');
        return { status: 'pending_review', submissionStatus: 'failed_captcha', failureReason: 'Formulario listo. Esta empresa exige verificación humana (CAPTCHA) al enviar: abre la oferta y da el último clic - Applica ya llenó todo.', logs };
      }
      log('Clicked submit (confirmation not detected)');
      return { status: 'pending_review', submissionStatus: 'failed_error', failureReason: 'No pudimos confirmar el envío automático. Revisa y aplica desde la oferta.', logs };
    }
    log('Submit located (Dry-Run: did not click)');
    return { status: 'approved', submissionStatus: 'dry_run', logs };
  }

  private async fillQuestionByLabel(page: import('playwright').Page, question: string, answer: string): Promise<boolean> {
    try {
      const label = page.getByText(question, { exact: false }).first();
      if (!(await label.count())) return false;
      const forId = await label.getAttribute('for');
      const field = forId
        // Attribute selector, not `#id`: numeric ids ("9120…") make `#9120` invalid CSS.
        ? page.locator(`[id="${forId.replace(/"/g, '')}"]`)
        : label.locator('xpath=following::*[self::input or self::textarea or self::select][1]');
      if (!(await field.count())) return false;
      const tag = await field.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
      if (tag === 'select') {
        await field.selectOption({ label: answer }).catch(async () => { await field.selectOption(answer).catch(() => undefined); });
        return true;
      }
      await field.fill(answer).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }
}
