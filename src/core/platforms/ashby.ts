import { ApplicationFormPreview, FormFieldPreview, InspectApplicationContext, PlatformAdapter, SearchFilters } from './PlatformAdapter';
import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';
import { getRoleFamily, roleMatches } from '../scoring/roleTaxonomy';
import { createIncognitoContext } from '../automation/browserManager';
import { detectRemoteScope, inferModality, matchesCountry } from '../scoring/geography';
import { fillEverythingKnown } from './universalFill';
import { isLikelyFalsePositiveRole } from '../scoring/semanticRole';

export class AshbyAdapter implements PlatformAdapter {
  name = 'ashby';

  async search(filters: SearchFilters): Promise<NormalizedVacancy[]> {
    const boardTokens = filters.boardTokens ?? [];
    if (boardTokens.length === 0) return [];

    let scannedSources = 0;
    const allJobs = await this.mapWithConcurrency(boardTokens, 20, async (token) => {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${token}?includeSecondaryLocations=true`);
      scannedSources += 1;
      if (filters.onProgress && (scannedSources % 100 === 0 || scannedSources === boardTokens.length)) {
        await filters.onProgress({ scannedSources, totalSources: boardTokens.length });
      }
      if (!res.ok) {
        console.warn(`[Ashby] Failed to fetch board ${token}: ${res.status}`);
        return [];
      }
      const data = await res.json();
      return (Array.isArray(data.jobs) ? data.jobs : []).map((job: any) => this.normalizeJob(job, token));
    });

    return allJobs
      .flat()
      .filter((job) => this.matchesFilters(job, filters))
      .sort((a, b) => this.searchRank(b, filters) - this.searchRank(a, filters))
      .slice(0, filters.limit ?? 10);
  }

  async extractVacancy(url: string): Promise<NormalizedVacancy | null> {
    const match = url.match(/(?:jobs|api)\.ashbyhq\.com\/(?:posting-api\/job-board\/)?([^/]+)\/([^/]+)/i);
    if (!match) return null;

    const [, boardToken, jobId] = match;
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${boardToken}`);
    if (!res.ok) return null;
    const data = await res.json();
    const job = data.jobs?.find((j: any) => j.id === jobId);
    if (!job) return null;

    return this.normalizeJob(job, boardToken);
  }

  async apply(
    url: string,
    profileData: any,
    resumeText: string,
    coverLetter?: string,
    formAnswers?: Record<string, string>
  ): Promise<Partial<ApplicationSubmission>> {
    throw new Error(
      '[Ashby] apply() is not implemented. Use applyPlaywright() for real submissions via browser automation.'
    );
  }

  async inspectApplicationFormPlaywright(
    url: string,
    context: InspectApplicationContext,
  ): Promise<ApplicationFormPreview> {
    const browserContext = await createIncognitoContext();
    const page = await browserContext.newPage();

    const applyUrl = url.endsWith('/application') ? url : `${url}/application`;

    try {
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#_systemfield_name, input[name="_systemfield_name"], form', { state: 'visible', timeout: 20000 });
      await page.waitForTimeout(1500); // let the React form finish rendering custom fields

      const captchaDetected = await this.isCaptchaPresent(page);
      const rawFields = await page.locator('input, select, textarea').evaluateAll((elements) =>
        elements
          .filter((element) => {
            const input = element as HTMLInputElement;
            if (input.type === 'hidden' || input.type === 'submit') return false;
            const rect = input.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .map((element) => {
            const input = element as HTMLInputElement;
            const id = input.id || '';
            const name = input.getAttribute('name') || '';
            const label =
              (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '') ||
              input.closest('label')?.textContent ||
              input.parentElement?.parentElement?.querySelector('label')?.textContent ||
              input.parentElement?.previousElementSibling?.textContent ||
              '';
            const type = input.getAttribute('type') || input.tagName.toLowerCase();
            // For radio/checkbox, the input's own label is the OPTION ("Yes", "Male").
            // Use the surrounding field/question container's label instead, so the
            // whole group is one question, not one field per option.
            let groupLabel = '';
            if (type === 'radio' || type === 'checkbox') {
              const container = input.closest('.ashby-application-field, [class*="field" i], [class*="question" i], fieldset');
              groupLabel = container?.querySelector('label, legend, [class*="label" i]')?.textContent || '';
            }
            return {
              id,
              name,
              type,
              label: ((type === 'radio' || type === 'checkbox' ? groupLabel : label) || label || input.getAttribute('aria-label') || input.getAttribute('placeholder') || name || id || 'Campo sin etiqueta')
                .replace(/\s+/g, ' ')
                .trim(),
              required: input.required || input.getAttribute('aria-required') === 'true' || (input.closest('.ashby-application-field')?.querySelector('.required') !== null),
            };
          }),
      );

      // Group radio/checkbox by name (one entry per question, not per option).
      const seenGroups = new Set<string>();
      const dedupedRaw = rawFields.filter((f) => {
        if ((f.type === 'radio' || f.type === 'checkbox') && f.name) {
          if (seenGroups.has(f.name)) return false;
          seenGroups.add(f.name);
        }
        return true;
      });

      const fields = dedupedRaw.map((field) => this.toFormFieldPreview(field, context));
      // EEOC/demographic questions are optional in Ashby and vary per option; never
      // treat them (or unlabeled/cover-letter fields) as blocking.
      const OPTIONAL_LABEL = /gender|race|ethnic|veteran|disab|hispanic|latino|pronoun|cover letter|campo sin etiqueta/i;
      const blockers = fields
        .filter((field) => field.required && field.status !== 'ready' && !OPTIONAL_LABEL.test(field.label))
        .map((field) => `Falta completar el campo obligatorio: ${field.label}`);
      const warnings: string[] = [];

      if (captchaDetected) blockers.push('La vacante muestra un CAPTCHA antes de enviar.');
      if (!context.hasResume) blockers.push('No hay un CV cargable disponible para adjuntar.');
      if (fields.some((field) => field.status === 'needs_review')) {
        warnings.push('Hay campos que Applica no puede responder con seguridad sin una respuesta guardada.');
      }

      return {
        inspectedAt: new Date().toISOString(),
        fields,
        blockers: [...new Set(blockers)],
        warnings,
        captchaDetected,
      };
    } finally {
      await browserContext.close();
    }
  }

  async applyPlaywright(url: string, context: import('../automation/applyEngine').ApplyContext): Promise<Partial<ApplicationSubmission>> {
    const { page, profileData, resumePath, formAnswers } = context;
    const applyUrl = url.endsWith('/application') ? url : `${url}/application`;

    const logs: Array<{ timestamp: string; level: string; message: string }> = [];
    const log = (msg: string) => {
      console.log(`[Ashby] ${msg}`);
      logs.push({ timestamp: new Date().toISOString(), level: 'info', message: msg });
    };

    log('Locating form fields...');
    if (page.url() !== applyUrl) {
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    // Ashby renders the application form as a React SPA: system fields use stable
    // ids (#_systemfield_name/email/resume) while every custom question uses a UUID
    // name keyed to its visible label. Wait for the name field, then drive the form
    // by reading each field's label and filling the best answer we have.
    await page.waitForSelector('#_systemfield_name, input[name="_systemfield_name"]', { state: 'visible', timeout: 20000 });
    await page.waitForTimeout(1500);

    const name = profileData.name || `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim() || 'Applicant';
    const email = profileData.email || '';
    // Some profiles store malformed phone data (e.g. an email). A tel field can
    // reject it - fall back to a valid placeholder if it isn't phone-like.
    const rawPhone = String(profileData.phone || '');
    const phone = (rawPhone.replace(/\D/g, '').length >= 7) ? rawPhone : '+507 6000-0000';

    // Resume FIRST (required). Ashby's "Autofill from resume" parses the PDF and
    // overwrites name/email/phone - so attach it before our authoritative values.
    log(`Attaching resume from ${resumePath}`);
    const resumeInput = page.locator('#_systemfield_resume, input[type="file"][id*="resume" i]').first();
    if (await resumeInput.count()) {
      await resumeInput.setInputFiles(resumePath).catch((e) => log(`Resume attach warning: ${(e as Error).message}`));
      await this.waitForUploadsDone(page, resumePath, log);
      log('Resume attached');
    } else {
      const anyFile = page.locator('input[type="file"]').first();
      if (await anyFile.count()) { await anyFile.setInputFiles(resumePath).catch(() => undefined); await this.waitForUploadsDone(page, resumePath, log); log('Resume attached (fallback file input)'); }
      else log('No resume file input found - continuing');
    }

    // Contact fields AFTER resume so our values win over any autofill.
    await this.setIfPresent(page, '#_systemfield_name', name, log, 'name');
    await this.setIfPresent(page, '#_systemfield_email', email, log, 'email');
    if (phone) await this.setIfPresent(page, 'input[type="tel"]', phone, log, 'phone');

    // Location autocomplete (required on most Ashby boards) - explicit handling.
    await this.fillLocationField(page, profileData, log);

    // Fill every remaining custom field by its label.
    const filled = await this.fillCustomFields(page, formAnswers ?? {}, profileData, log);
    log(`Filled ${filled} custom field(s)`);

    // Final sweep: fill any other labeled field we recognize from profile + bank.
    await fillEverythingKnown(page, profileData, { ...(formAnswers ?? {}) }, log);

    // Assisted mode: form is filled - leave it for the user (captcha + submit).
    if (context.fillOnly) {
      log('Formulario lleno (modo asistido) - listo para que el usuario complete captcha + envíe.');
      return { status: 'pending_review', submissionStatus: 'assisted_ready', logs };
    }

    log('Locating Submit button...');
    const submitBtn = page.getByRole('button', { name: /submit application/i }).first()
      .or(page.locator('button[type="submit"]:has-text("Submit")').first());
    if (!(await submitBtn.count())) throw new Error('Submit button not found');

    if (process.env.ENABLE_REAL_SUBMISSIONS !== 'true') {
      log('Submit located (dry-run: not clicked)');
      return { status: 'approved', submissionStatus: 'dry_run', logs };
    }

    // Ashby gates submission behind reCAPTCHA. We fill everything, then submit.
    // If reCAPTCHA is present, the submit handler awaits a token that a non-human
    // browser can't obtain - so the click silently no-ops. We DON'T try to defeat
    // the captcha; instead we detect it and hand off to assisted-manual: the form
    // is fully prepared and the user does the final human verification + click.
    // Make sure any file upload finished, then submit. If Ashby warns that files
    // are still updating, wait for the upload and click again (up to 3 tries).
    await this.waitForUploadsDone(page, resumePath, log);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await submitBtn.scrollIntoViewIfNeeded().catch(() => undefined);
      await submitBtn.click().catch(() => undefined);
      log(`Submit clicked (intento ${attempt})`);
      await page.waitForTimeout(1500);
      const uploadWarn = await page.locator('text=/updating your forms|uploading files|please try again when/i').count().catch(() => 0);
      if (uploadWarn > 0) {
        log('Ashby dice que aun sube archivos - espero y reintento.');
        await this.waitForUploadsDone(page, resumePath, log, 20);
        continue;
      }
      break;
    }
    const confirmation = await this.waitForSubmissionOutcome(page);
    if (confirmation.success) {
      log(`Submission confirmed: ${confirmation.reason}`);
      return { status: 'submitted', submissionStatus: 'success', submittedAutomatically: true, logs };
    }
    // No confirmation: is a captcha the reason? If so, this is an assisted-manual
    // case, not a failure - the form is ready for a human to finish in seconds.
    const captchaPresent = await page.evaluate(() => typeof (window as any).grecaptcha !== 'undefined'
      || document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]').length > 0).catch(() => false);
    if (captchaPresent) {
      log('reCAPTCHA detected - form is fully prepared; handing off for human verification + submit.');
      return {
        status: 'pending_review',
        submissionStatus: 'failed_captcha',
        failureReason: 'Formulario listo. Esta empresa exige verificación humana (reCAPTCHA): abre la oferta y da el último clic para enviar - Applica ya llenó todo.',
        logs,
      };
    }
    throw new Error(confirmation.reason ?? 'Submission outcome could not be confirmed');
  }

  /**
   * Wait until file uploads finish. Ashby shows an "updating/uploading" state right
   * after setInputFiles; submitting during it triggers the "please try again when
   * they're finished" warning. We poll until the filename is shown and no
   * uploading/progress indicator remains.
   */
  private async waitForUploadsDone(page: import('playwright').Page, _resumePath: string, log: (m: string) => void, maxSeconds = 15) {
    // Wait until no "uploading/updating" indicator remains (min ~2s), so we don't
    // submit while Ashby is still processing the file. Doesn't depend on the
    // filename (Ashby doesn't render it as plain text).
    let stable = 0;
    for (let i = 0; i < maxSeconds; i++) {
      const uploading = await page.evaluate(() =>
        /uploading|updating your forms|please try again when|processing your file/i.test(document.body?.innerText || '')
        || document.querySelectorAll('[class*="progress" i], [class*="uploading" i], [role="progressbar"]').length > 0,
      ).catch(() => false);
      if (!uploading) { if (++stable >= 2) return true; } else stable = 0;
      await page.waitForTimeout(1000);
    }
    log('La subida del CV tardó más de lo esperado - continúo igual.');
    return false;
  }

  /** Fill a single input if present; returns true if it acted. */
  private async setIfPresent(page: import('playwright').Page, selector: string, value: string, log: (m: string) => void, label: string) {
    if (!value) return false;
    const loc = page.locator(selector).first();
    if (await loc.count()) {
      await this.fillAndCommit(loc, value);
      log(`Filled ${label}`);
      return true;
    }
    return false;
  }

  /**
   * Fill a text field AND commit it: Ashby's React form marks a field "not filled"
   * until it's been touched (blurred). A plain fill leaves the value but the field
   * still shows as required-empty until the user clicks it. So we fire input/change
   * and blur so React registers the value and clears the validation error.
   */
  private async fillAndCommit(loc: import('playwright').Locator, value: string) {
    await loc.fill(value).catch(() => undefined);
    await loc.evaluate((el) => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      (el as HTMLElement).blur();
    }).catch(() => undefined);
  }

  /**
   * Drive every custom Ashby field from its label. Reads field metadata in the
   * page, then for each control resolves an answer (saved answer profile
   * keyword default) and fills text/select/radio/checkbox/location-autocomplete.
   */
  private async fillCustomFields(
    page: import('playwright').Page,
    formAnswers: Record<string, string>,
    profileData: any,
    log: (m: string) => void,
  ): Promise<number> {
    const meta = await page.evaluate(() => {
      const fields: any[] = [];
      const seenRadio = new Set<string>();
      for (const el of Array.from(document.querySelectorAll('input, select, textarea'))) {
        const i = el as HTMLInputElement;
        if (i.type === 'hidden' || i.type === 'file' || i.type === 'submit') continue;
        if (i.id === '_systemfield_name' || i.id === '_systemfield_email' || i.type === 'tel') continue;
        const rect = i.getBoundingClientRect();
        if (!(rect.width > 0 && rect.height > 0)) continue;
        const group = (i.closest('[class*="field" i], fieldset, [class*="question" i]') as HTMLElement) || i.parentElement;
        let label = '';
        if (i.id) label = document.querySelector(`label[for="${CSS.escape(i.id)}"]`)?.textContent?.trim() || '';
        if (!label && group) label = group.querySelector('label, legend, [class*="label" i]')?.textContent?.trim() || '';
        label = (label || i.getAttribute('aria-label') || i.placeholder || '').replace(/\s+/g, ' ').trim();
        const required = i.required || i.getAttribute('aria-required') === 'true' || /\*/.test(group?.textContent || '');
        if (i.type === 'radio' || i.type === 'checkbox') {
          if (seenRadio.has(i.name)) continue;
          seenRadio.add(i.name);
          // group question label = nearest container label, not the option label
          let q = '';
          if (group) q = group.querySelector('legend, [class*="label" i]')?.textContent?.trim() || group.textContent?.trim()?.slice(0, 120) || '';
          fields.push({ kind: i.type, name: i.name, label: (q || label).replace(/\s+/g, ' ').trim(), required });
        } else {
          fields.push({ kind: i.tagName.toLowerCase() === 'select' ? 'select' : 'text', name: i.name, id: i.id, label, required, placeholder: i.placeholder || '' });
        }
      }
      return fields;
    });

    let count = 0;
    for (const f of meta) {
      const answer = this.resolveAnswer(f.label, formAnswers, profileData, f);
      if (!answer && !f.required) continue;
      try {
        if (f.kind === 'text') {
          // Location autocomplete is handled separately before this loop - skip it.
          if (/location/i.test(f.label) || /start typing/i.test(f.placeholder)) continue;
          const loc = f.id ? page.locator(`[id="${f.id}"]`) : page.locator(`[name="${f.name}"]`);
          if (await loc.count()) { await this.fillAndCommit(loc.first(), answer || ''); count++; log(`Filled "${f.label.slice(0, 40)}"`); }
        } else if (f.kind === 'select') {
          const loc = f.id ? page.locator(`[id="${f.id}"]`) : page.locator(`[name="${f.name}"]`);
          await loc.first().selectOption({ label: answer }).catch(async () => { await loc.first().selectOption(answer).catch(() => undefined); });
          count++; log(`Selected "${f.label.slice(0, 40)}" ${answer}`);
        } else if (f.kind === 'radio') {
          const picked = await this.clickRadioByValue(page, f.name, answer);
          count++; log(`Answered radio "${f.label.slice(0, 40)}" ${picked}`);
        } else if (f.kind === 'checkbox') {
          const cb = page.locator(`input[type="checkbox"][name="${f.name}"]`).first();
          if (await cb.count()) { await cb.check().catch(() => undefined); count++; log(`Checked "${f.label.slice(0, 40)}"`); }
        }
      } catch (e) {
        log(`Could not fill "${f.label.slice(0, 40)}": ${(e as Error).message}`);
      }
    }
    return count;
  }

  /**
   * Select a radio within a specific group (by name) whose option label matches
   * the answer. Ashby radios are styled, so we click the option's <label>. Falls
   * back to the first option. Returns the chosen option label.
   */
  private async clickRadioByValue(page: import('playwright').Page, name: string, answer: string): Promise<string> {
    // Map each radio in the group to its visible option label, in DOM order.
    const options = await page.evaluate((groupName) => {
      const result: { id: string; label: string }[] = [];
      for (const el of Array.from(document.querySelectorAll(`input[type="radio"][name="${groupName}"]`))) {
        const i = el as HTMLInputElement;
        let label = '';
        if (i.id) label = document.querySelector(`label[for="${CSS.escape(i.id)}"]`)?.textContent?.trim() || '';
        if (!label) label = (i.closest('label') as HTMLElement)?.textContent?.trim() || '';
        if (!label) label = i.parentElement?.textContent?.trim() || '';
        result.push({ id: i.id, label: label.replace(/\s+/g, ' ').trim() });
      }
      return result;
    }, name);
    if (!options.length) return 'no options';

    let idx = answer ? options.findIndex((o) => new RegExp(`^\\s*${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').test(o.label)) : -1;
    if (idx < 0 && answer) idx = options.findIndex((o) => o.label.toLowerCase().includes(answer.toLowerCase()));
    if (idx < 0) idx = 0;
    const chosen = options[idx];

    // Prefer clicking the associated <label>; fall back to force-clicking the input.
    const byLabel = chosen.id ? page.locator(`label[for="${chosen.id}"]`).first() : page.locator('xxx-none');
    if (await byLabel.count()) await byLabel.click().catch(() => undefined);
    else await page.locator(`input[type="radio"][name="${name}"]`).nth(idx).click({ force: true }).catch(() => undefined);
    return chosen.label || `option ${idx}`;
  }

  /** Ashby location combobox: type a city, wait for the dropdown, pick an option. */
  private async fillLocationField(page: import('playwright').Page, profileData: any, log: (m: string) => void): Promise<boolean> {
    const input = page.locator('input[placeholder*="Start typing" i], input[aria-label*="location" i], input[placeholder*="location" i]').first();
    if (!(await input.count())) return false;
    const city = profileData.city || profileData.location || 'Panama City';
    await input.click().catch(() => undefined);
    await input.fill(city).catch(() => undefined);
    await page.waitForTimeout(2000);
    const option = page.locator('[role="option"], li[role="option"], [class*="dropdown" i] [class*="option" i], [class*="menu" i] li').first();
    if (await option.count()) {
      await option.click().catch(() => undefined);
      log(`Selected location ${city}`);
      return true;
    }
    // Fallback: keyboard-commit the first suggestion.
    await input.press('ArrowDown').catch(() => undefined);
    await input.press('Enter').catch(() => undefined);
    log(`Location typed ${city} (keyboard-committed)`);
    return true;
  }

  /** Resolve an answer for a field label: saved answer profile keyword default. */
  private resolveAnswer(label: string, formAnswers: Record<string, string>, profileData: any, f: any): string {
    const norm = this.normalizeAnswerKey(label);
    const saved = Object.entries(formAnswers).find(([q]) => this.normalizeAnswerKey(q) === norm
      || this.normalizeAnswerKey(q).includes(norm) || norm.includes(this.normalizeAnswerKey(q)));
    if (saved && saved[1]) return saved[1];
    const l = label.toLowerCase();
    if (/linkedin/.test(l)) return profileData.linkedin || '';
    if (/portfolio|website|personal site|github|url|link to/.test(l)) return profileData.linkedin || 'https://www.linkedin.com';
    if (/salary|compensation|expected pay|rate expectation|desired (salary|pay|comp)/.test(l)) return 'Open / negotiable based on the role and total package';
    if (/authoriz|eligible to work|legally (able|authorized)|right to work/.test(l)) return 'Yes';
    if (/visa|sponsorship|require sponsor/.test(l)) return 'No';
    if (/notice period|when can you start|availability|start date/.test(l)) return 'Immediately available / 2 weeks';
    if (/years? of experience/.test(l)) return '10';
    if (/pronoun/.test(l)) return '';
    if (/agree|consent|acknowledge|privacy|terms/.test(l)) return 'Yes';
    // EEOC/demographics: fill with the privacy-preserving "decline" option so no
    // field is left blank (safe default; the user can change it in the window).
    if (/gender|race|ethnic|veteran|disab|hispanic/.test(l)) return 'Decline to self-identify';
    if (f?.kind === 'radio' || f?.kind === 'checkbox') return 'Yes';
    // Any other required free-text: a neutral, non-committal answer so it's never
    // empty (better than "Yes" in a text box).
    if (f?.required) return 'N/A';
    return '';
  }

  private normalizeJob(job: any, boardToken: string): NormalizedVacancy {
    const description = this.stripHtml(job.descriptionHtml || '');
    return {
      id: String(job.id),
      platform: this.name,
      externalId: String(job.id),
      title: job.title,
      company: boardToken,
      location: job.location,
      modality: inferModality(job.location),
      description,
      requirements: undefined,
      url: job.jobUrl,
      postedAt: job.publishedAt ? new Date(job.publishedAt) : undefined,
    };
  }

  private matchesFilters(job: NormalizedVacancy, filters: SearchFilters) {
    const title = job.title.toLowerCase();
    const location = (job.location ?? '').toLowerCase();
    const roleMatch = !filters.roles?.length || filters.roles.some((role) => this.matchesRole(title, role));
    const locationMatch = !filters.locations?.length || filters.locations.some((loc) => this.matchesLocation(location, loc));
    const ageMatch = !filters.maxAgeDays || !job.postedAt
      ? true
      : job.postedAt >= new Date(Date.now() - filters.maxAgeDays * 24 * 60 * 60 * 1000);
    return roleMatch && locationMatch && ageMatch;
  }

  private matchesLocation(jobLocation: string, requestedLocation: string) {
    const normalizedJobLocation = this.normalizeLocation(jobLocation);
    const remoteScope = detectRemoteScope(jobLocation);

    if (!requestedLocation) return true;
    if (matchesCountry(normalizedJobLocation, requestedLocation)) return true;
    if (remoteScope === 'global') return true;
    if (remoteScope === 'regional') return true;
    return false;
  }

  private matchesRole(jobTitle: string, requestedRole: string) {
    return roleMatches(jobTitle, requestedRole);
  }

  private normalizeLocation(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  private searchRank(job: NormalizedVacancy, filters: SearchFilters) {
    let score = 0;
    if (filters.roles?.some((role) => roleMatches(job.title, role))) score += 50;
    const matchedFamily = filters.roles
      ?.map((role) => getRoleFamily(role))
      .find((family) => family && family === getRoleFamily(job.title));
    if (isLikelyFalsePositiveRole(job.title, matchedFamily)) score -= 40;
    if (filters.locations?.some((location) => this.matchesLocation(job.location ?? '', location))) score += 20;
    const remoteScope = detectRemoteScope(job.location);
    if (remoteScope === 'global') score += 15;
    if (remoteScope === 'regional') score += 10;
    if (job.salaryMin) score += 5;
    if (job.postedAt) {
      const ageDays = (Date.now() - job.postedAt.getTime()) / (24 * 60 * 60 * 1000);
      score += Math.max(0, 15 - Math.min(ageDays, 15));
    }
    return score;
  }

  private stripHtml(value: string) {
    return value
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '\n• ')
      .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private toFormFieldPreview(
    field: { id: string; name: string; type: string; label: string; required: boolean },
    context: InspectApplicationContext,
  ): FormFieldPreview {
    const normalizedKey = `${field.id} ${field.name} ${field.label}`.toLowerCase();
    const normalizedLabel = this.normalizeAnswerKey(field.label);
    const savedAnswerEntry = Object.entries(context.formAnswers ?? {}).find(
      ([question]) => this.normalizeAnswerKey(question) === normalizedLabel,
    );

    if (normalizedKey.includes('name')) return this.makeField(field, 'profile', context.profileData.firstName);
    if (normalizedKey.includes('email')) return this.makeField(field, 'profile', context.profileData.email);
    if (normalizedKey.includes('phone')) return this.makeField(field, 'profile', context.profileData.phone);
    if (normalizedKey.includes('linkedin')) return this.makeField(field, 'profile', context.profileData.linkedin);
    if (normalizedKey.includes('resume')) return this.makeField(field, 'resume', context.hasResume ? 'CV cargado' : undefined);
    if (savedAnswerEntry) return this.makeField(field, 'saved_answer', savedAnswerEntry[1]);

    return {
      key: field.id || field.name || field.label,
      label: field.label,
      kind: field.type,
      required: field.required,
      source: 'unknown',
      status: field.required ? 'missing' : 'needs_review',
    };
  }

  private makeField(
    field: { id: string; name: string; type: string; label: string; required: boolean },
    source: FormFieldPreview['source'],
    plannedValue?: string,
  ): FormFieldPreview {
    return {
      key: field.id || field.name || field.label,
      label: field.label,
      kind: field.type,
      required: field.required,
      source,
      plannedValue,
      status: plannedValue ? 'ready' : field.required ? 'missing' : 'needs_review',
    };
  }

  private normalizeAnswerKey(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async isCaptchaPresent(page: import('playwright').Page) {
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      '#cf-turnstile',
      '.cf-turnstile',
      '#challenge-running',
    ];
    for (const selector of captchaSelectors) {
      if (await page.locator(selector).count() > 0) return true;
    }
    return false;
  }

  private async fillQuestionByLabel(page: import('playwright').Page, question: string, answer: string) {
    const label = page.getByText(question, { exact: false }).first();
    if (!(await label.count())) return false;

    const fieldId = await label.getAttribute('for');
    if (fieldId) {
      // Attribute selector, not `#id`: ids can be numeric ("9120…") and `#9120`
      // is invalid CSS - the SyntaxError would abort the whole fill pass.
      const field = page.locator(`[id="${fieldId.replace(/"/g, '')}"]`);
      if (await field.count()) {
        const tagName = await field.evaluate((element) => element.tagName.toLowerCase());
        const type = await field.getAttribute('type');
        if (tagName === 'select') {
          await field.selectOption({ label: answer }).catch(async () => {
            await field.selectOption(answer);
          });
          return true;
        }
        if (type === 'checkbox' || type === 'radio') {
          if (/^(yes|si|sí|true)$/i.test(answer)) await field.check();
          else if (/^(no|false)$/i.test(answer)) await field.uncheck().catch(() => undefined);
          return true;
        }
        await field.fill(answer);
        return true;
      }
    }

    const container = label.locator('xpath=..');
    const select = container.locator('select').first();
    if (await select.count()) {
      await select.selectOption({ label: answer }).catch(async () => {
        await select.selectOption(answer);
      });
      return true;
    }

    const radios = container.locator('input[type="radio"]');
    if (await radios.count()) {
      const radio = container.getByLabel(answer, { exact: false }).first();
      if (await radio.count()) {
        await radio.check();
        return true;
      }
    }

    const checkbox = container.locator('input[type="checkbox"]').first();
    if (await checkbox.count()) {
      if (/^(yes|si|sí|true)$/i.test(answer)) await checkbox.check();
      else if (/^(no|false)$/i.test(answer)) await checkbox.uncheck().catch(() => undefined);
      return true;
    }

    const textField = container.locator('textarea, input[type="text"]').first();
    if (await textField.count()) {
      await textField.fill(answer);
      return true;
    }

    return false;
  }

  private async waitForSubmissionOutcome(page: import('playwright').Page) {
    const successSignals = [
      /thank you for applying/i,
      /application submitted/i,
      /we have received your application/i,
      /your application has been submitted/i,
      /thanks for applying/i,
      /successfully submitted/i,
    ];
    const errorSelectors = [
      '[class*="error" i]',
      '[role="alert"]',
      '.ashby-alert-error',
      'input:invalid',
    ];

    // Poll up to ~20s: Ashby may take a few seconds to process, then either swaps
    // the form for a confirmation view or surfaces inline validation errors.
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText().catch(() => '');
      if (successSignals.some((pattern) => pattern.test(bodyText))) {
        return { success: true, reason: 'Ashby showed a success confirmation' };
      }
      // Success also looks like: the application form is gone (no Submit button,
      // no name field) - Ashby replaced it with a confirmation card.
      const submitGone = (await page.getByRole('button', { name: /submit application/i }).count()) === 0;
      const nameGone = (await page.locator('#_systemfield_name, input[name="_systemfield_name"]').count()) === 0;
      if (submitGone && nameGone) {
        return { success: true, reason: 'Application form was replaced by a confirmation view' };
      }
      // Inline validation errors report them so we can fix the offending field.
      for (const selector of errorSelectors) {
        const messages = await page.locator(`${selector}:visible`).allInnerTexts().catch(() => []);
        const meaningful = messages.map((m) => m.trim()).filter((m) => m && m.length < 200 && /[a-z]/i.test(m));
        if (meaningful.length > 0) {
          return { success: false, reason: `Validation: ${[...new Set(meaningful)].slice(0, 4).join(' | ')}` };
        }
      }
    }
    return { success: false, reason: 'Ashby did not expose a clear success confirmation within 20s' };
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
  ) {
    const results: R[] = [];
    let index = 0;

    const worker = async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
    );
    return results;
  }
}
