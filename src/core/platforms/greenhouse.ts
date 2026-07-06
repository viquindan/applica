import { ApplicationFormPreview, FormFieldPreview, InspectApplicationContext, PlatformAdapter, SearchFilters } from './PlatformAdapter';
import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';
import { getRoleFamily, roleMatches } from '../scoring/roleTaxonomy';
import { createIncognitoContext } from '../automation/browserManager';
import { detectRemoteScope, inferModality, matchesCountry } from '../scoring/geography';
import { fillEverythingKnown, DECLINE_ANSWER, DECLINE_OPTION_RX } from './universalFill';
import { extractSalaryRange, toMonthlyAmount } from '../scoring/salary';
import { isLikelyFalsePositiveRole } from '../scoring/semanticRole';

export class GreenhouseAdapter implements PlatformAdapter {
  name = 'greenhouse';

  async search(filters: SearchFilters): Promise<NormalizedVacancy[]> {
    const boardTokens = filters.boardTokens ?? [];
    if (boardTokens.length === 0) return [];

    let scannedSources = 0;
    const allJobs = await this.mapWithConcurrency(boardTokens, 20, async (token) => {
      const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
      scannedSources += 1;
      if (filters.onProgress && (scannedSources % 100 === 0 || scannedSources === boardTokens.length)) {
        await filters.onProgress({ scannedSources, totalSources: boardTokens.length });
      }
      if (!res.ok) {
        console.warn(`[Greenhouse] Failed to fetch board ${token}: ${res.status}`);
        return [];
      }
      const data = await res.json();
      return (data.jobs ?? []).map((job: any) => this.normalizeJob(job, token));
    });

    return allJobs
      .flat()
      .filter((job) => this.matchesFilters(job, filters))
      .sort((a, b) => this.searchRank(b, filters) - this.searchRank(a, filters))
      .slice(0, filters.limit ?? 10);
  }

  async extractVacancy(url: string): Promise<NormalizedVacancy | null> {
    const match = url.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/i);
    if (!match) return null;

    const [, boardToken, jobId] = match;
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs/${jobId}`);
    if (!res.ok) return null;
    const job = await res.json();
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
      '[Greenhouse] apply() is not implemented. Use applyPlaywright() for real submissions via browser automation.'
    );
  }

  async inspectApplicationFormPlaywright(
    url: string,
    context: InspectApplicationContext,
  ): Promise<ApplicationFormPreview> {
    const browserContext = await createIncognitoContext();
    const page = await browserContext.newPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#main_fields, input#first_name', { state: 'visible', timeout: 10000 });

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
              '';
            return {
              id,
              name,
              type: input.getAttribute('type') || input.tagName.toLowerCase(),
              label: (label || input.getAttribute('aria-label') || input.getAttribute('placeholder') || name || id || 'Campo sin etiqueta')
                .replace(/\s+/g, ' ')
                .trim(),
              required: input.required || input.getAttribute('aria-required') === 'true',
            };
          }),
      );

      const fields = rawFields.map((field) => this.toFormFieldPreview(field, context));
      const blockers = fields
        .filter((field) => field.required && field.status !== 'ready')
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
    const logs: Array<{ timestamp: string; level: string; message: string }> = [];
    const log = (msg: string) => {
      console.log(`[Greenhouse] ${msg}`);
      logs.push({ timestamp: new Date().toISOString(), level: 'info', message: msg });
    };

    log('Locating form fields...');

    // Extract basic profile data (assuming unified structure)
    const firstName = profileData.firstName || profileData.name?.split(' ')[0] || 'Applicant';
    const lastName = profileData.lastName || profileData.name?.split(' ').slice(1).join(' ') || 'Name';
    const email = profileData.email || '';
    const rawPhone = String(profileData.phone || '');
    const phone = (rawPhone.replace(/\D/g, '').length >= 7) ? rawPhone : '+507 6000-0000';
    const linkedin = profileData.linkedin || '';

    // The real-browser flow hands us a fresh about:blank page and expects the
    // adapter to navigate itself (Lever/Ashby/SR all do). Skip when the caller
    // already navigated (bundled flow): an exact URL compare would re-navigate,
    // because Greenhouse redirects boards.greenhouse.io -> job-boards.greenhouse.io.
    if (!page.url().includes('greenhouse.io')) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    // Wait for legacy or current Greenhouse form markup.
    await page.waitForSelector('#main_fields, input#first_name, input[autocomplete="given-name"], input[aria-label*="First" i]', { state: 'visible', timeout: 15000 });

    // Fill a field by the first matching selector, committing it so React registers
    // the value (input/change) and marks it touched (blur) - otherwise Greenhouse's
    // React form can show it as empty/required until the user clicks it, or clear it
    // on a re-render.
    const commitFill = async (loc: import('playwright').Locator, value: string) => {
      await loc.fill(value).catch(() => undefined);
      await loc.evaluate((el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); (el as HTMLElement).blur(); }).catch(() => undefined);
    };
    const fillByAny = async (selectors: string[], value: string, label: string) => {
      if (!value) return false;
      for (const sel of selectors) {
        const loc = page.locator(sel).first();
        if (await loc.count()) { await commitFill(loc, value); log(`Filled ${label}`); return true; }
      }
      log(`${label}: no field found`);
      return false;
    };

    // Resume FIRST so later re-renders (autocompletes, upload) don't clear contact fields.
    // The new job-boards UI ignores a direct setInputFiles on input#resume (files
    // land on the input but the widget never uploads/shows them - the user saw
    // "no CV attached" while our log said "attached"). Like SR's dropzone, only
    // the NATIVE file chooser (clicking its own "Attach" button) registers the
    // file. setInputFiles stays as fallback for the legacy boards.greenhouse.io UI.
    if (resumePath) {
      log(`Attaching resume from ${resumePath}`);
      const baseName = resumePath.split(/[\\/]/).pop() ?? '';
      // Attached = the FILE NAME shows up in the page (the widget renders a chip
      // and removes input#resume after its S3 upload succeeds). Trust the page,
      // not the API call - setInputFiles "worked" while the form showed nothing.
      const verifyAttached = async (ms: number) => {
        for (let waited = 0; waited < ms; waited += 500) {
          await page.waitForTimeout(500);
          if (await page.evaluate((name) => (document.body?.innerText || '').includes(name), baseName).catch(() => false)) return true;
        }
        return false;
      };
      // First "Attach" button on the page = Resume/CV (its section renders before
      // Cover Letter's identical buttons). Clicking too early - before React wires
      // the handler - fires no filechooser, hence the wait + retry + fallback.
      const tryChooser = async () => {
        const attachBtn = page.getByRole('button', { name: /^attach$/i }).first();
        if (!(await attachBtn.count())) return false;
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null),
          attachBtn.click().catch(() => undefined),
        ]);
        if (!chooser) return false;
        await chooser.setFiles(resumePath).catch((e: unknown) => log(`filechooser warning: ${(e as Error)?.message ?? e}`));
        return true;
      };
      await page.waitForTimeout(1500); // let the SPA hydrate the widget
      let attached = (await tryChooser()) && (await verifyAttached(12000));
      if (!attached) {
        // Legacy boards.greenhouse.io UI (or a chooser that never fired).
        let fileInput = page.locator('input#resume, input[type="file"][name="resume"]').first();
        if (!(await fileInput.count())) fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count()) {
          await fileInput.setInputFiles(resumePath).catch((e) => log(`setInputFiles warning: ${e?.message ?? e}`));
          attached = await verifyAttached(8000);
        }
      }
      if (!attached) attached = (await tryChooser()) && (await verifyAttached(10000));
      log(attached ? 'Resume attached (visible en el formulario)' : 'OJO: el CV NO aparece adjunto en el formulario - el usuario deberá adjuntarlo.');
    }

    // Basic info (robust selectors + commit).
    await fillByAny(['input#first_name', 'input[name="first_name"]', 'input[autocomplete="given-name"]', 'input[aria-label*="First name" i]'], firstName, 'first name');
    await fillByAny(['input#last_name', 'input[name="last_name"]', 'input[autocomplete="family-name"]', 'input[aria-label*="Last name" i]'], lastName, 'last name');
    await fillByAny(['input#email', 'input[name="email"]', 'input[type="email"]', 'input[autocomplete="email"]', 'input[aria-label*="Email" i]'], email, 'email');
    await fillByAny(['input#phone', 'input[name="phone"]', 'input[type="tel"]', 'input[autocomplete="tel"]', 'input[aria-label*="Phone" i]'], phone, 'phone');
    await fillByAny(['input[id*="linkedin" i]', 'input[aria-label*="LinkedIn" i]'], linkedin, 'LinkedIn');

    for (const [question, answer] of Object.entries(formAnswers ?? {})) {
      // URL-type fields must get a URL, never prose. The bank can hold a verbose
      // AI-written "Website" answer ("My professional website is not publicly...")
      // which URL fields reject or which reads as junk. Use the first URL-looking
      // token from the answer, else the profile portfolio, else skip the field.
      let toFill = answer;
      if (/website|portfolio|\burl\b/i.test(question)) {
        const urlish = String(answer).split(/[\s,;]+/).find((t) => /^[\w.-]+\.[a-z]{2,}([/?#]\S*)?$/i.test(t) || /^https?:\/\//i.test(t));
        toFill = urlish || String(profileData.portfolio || '').split(/[\s,;]+/)[0] || '';
        if (!toFill) continue;
      }
      if (await this.fillQuestionByLabel(page, question, toFill, log, profileData.country)) {
        log(`Filled reusable answer for "${question}"`);
      }
    }

    // Greenhouse renders Country, Location and the EEOC demographics as react-select
    // typeaheads (id-based). Fill them explicitly: type + pick the matching option.
    const pick = (keys: string[]) => {
      for (const [k, v] of Object.entries(formAnswers ?? {})) {
        const nk = k.toLowerCase();
        if (!v || !keys.some((kk) => nk.includes(kk))) continue;
        // Only SHORT bank keys qualify as field aliases: the 120-char sponsorship
        // question contains the word "country" and was matching pick(['country']),
        // typing "Yes" into the Country combobox.
        if (nk.length > 40) continue;
        // The bank can hold internal ATS VALUES (UUIDs from an SR form) or AI
        // PROSE (a whole paragraph as "Location"). Neither can ever be a list
        // option - typing them into a combobox matches nothing. Skip both so the
        // clean profile fallback (city/country) gets used instead.
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v).trim())) continue;
        if (String(v).trim().length > 60) continue;
        return String(v);
      }
      return '';
    };
    const raceVal = pick(['race', 'hispanic', 'ethnic', 'latino']);
    const hispanicAns = /hispanic|latino/i.test(raceVal) ? 'Yes' : (raceVal ? 'No' : '');
    await this.fillTypeahead(page, 'country', pick(['country']) || profileData.country || 'Panama', log);
    await this.fillTypeahead(page, 'candidate-location', pick(['location', 'city']) || profileData.city || 'Panama City', log, profileData.country);
    // Demographics are VOLUNTARY: without an explicit bank answer, default to
    // the "decline to answer" option (never assert facts like veteran status).
    await this.fillTypeahead(page, 'gender', pick(['gender']) || DECLINE_ANSWER, log);
    await this.fillTypeahead(page, 'hispanic_ethnicity', hispanicAns || DECLINE_ANSWER, log);
    await this.fillTypeahead(page, 'veteran_status', pick(['veteran']) || DECLINE_ANSWER, log);
    await this.fillTypeahead(page, 'disability_status', pick(['disab']) || DECLINE_ANSWER, log);

    // Final sweep: fill any other labeled field we recognize from profile + bank.
    await fillEverythingKnown(page, profileData, { ...(formAnswers ?? {}) }, log);

    // Submission
    // Assisted mode: form is filled - leave it for the user (captcha + submit).
    if (context.fillOnly) {
      log('Formulario lleno (modo asistido) - listo para que el usuario complete captcha + envíe.');
      return { status: 'pending_review', submissionStatus: 'assisted_ready', logs };
    }

    log('Checking Submit button...');
    const submitBtn = page.locator('input[type="submit"], button#submit_app').or(page.getByText(/submit application/i));
    if (await submitBtn.count() > 0) {
      if (process.env.ENABLE_REAL_SUBMISSIONS === 'true') {
        await submitBtn.click();
        log('Submit button clicked');
        const confirmation = await this.waitForSubmissionOutcome(page);
        if (confirmation.success) {
          log(`Submission confirmed: ${confirmation.reason}`);
          return { status: 'submitted', submissionStatus: 'success', submittedAutomatically: true, logs };
        }
        // Greenhouse gates submit behind invisible reCAPTCHA. We don't defeat it -
        // if a human-verification challenge is the blocker, hand off to assisted.
        const captcha = await page.evaluate(() =>
          typeof (window as any).grecaptcha !== 'undefined'
          || document.querySelectorAll('iframe[src*="recaptcha"], iframe[src*="hcaptcha"]').length > 0
          || /select (all|items|each)|verify you (are|’re) human|press & hold/i.test(document.body?.innerText || ''),
        ).catch(() => false);
        if (captcha) {
          log('reCAPTCHA on submit - form prepared; handing off for human verification + submit.');
          return {
            status: 'pending_review',
            submissionStatus: 'failed_captcha',
            failureReason: 'Formulario listo. Esta empresa exige verificación humana (reCAPTCHA) al enviar: abre la oferta y da el último clic - Applica ya llenó todo.',
            logs,
          };
        }
        throw new Error(confirmation.reason ?? 'Submission outcome could not be confirmed');
      }
      log('Submit button located (Dry-Run: Did not click)');
    } else {
      throw new Error('Submit button not found');
    }

    // await page.waitForNavigation({ waitUntil: 'networkidle' }); // Uncomment when doing real submits

    return {
      status: 'approved',
      submissionStatus: 'dry_run',
      logs,
    };
  }

  private normalizeJob(job: any, boardToken: string): NormalizedVacancy {
    const description = this.stripHtml(job.content ?? '');
    const salary = extractSalaryRange(description);
    return {
      id: String(job.id),
      platform: this.name,
      externalId: String(job.id),
      title: job.title,
      company: boardToken,
      location: job.location?.name,
      modality: inferModality(job.location?.name),
      description,
      requirements: undefined,
      url: job.absolute_url,
      postedAt: job.updated_at ? new Date(job.updated_at) : undefined,
      salaryMin: toMonthlyAmount(salary.min, salary.period),
      salaryMax: toMonthlyAmount(salary.max, salary.period),
      salaryCurrency: salary.currency,
      salaryPeriod: 'month',
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
    // country_restricted remote: only matches if the user's country is in the location
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

    if (normalizedKey.includes('first_name')) return this.makeField(field, 'profile', context.profileData.firstName);
    if (normalizedKey.includes('last_name')) return this.makeField(field, 'profile', context.profileData.lastName);
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

  /**
   * Fill a Greenhouse react-select typeahead by id (Country, Location, EEOC).
   * Skips fields the bank loop already committed via pickComboOption.
   */
  private async fillTypeahead(page: import('playwright').Page, id: string, value: string, log: (m: string) => void, countryHint?: string) {
    if (!value) return;
    const input = page.locator(`[id="${id}"]`).first();
    if (!(await input.count())) return;
    if (await input.getAttribute('data-applica-filled').catch(() => null)) return; // already handled
    // Mark as handled up front: react-select keeps the visible input EMPTY after a
    // selection (the value renders in a sibling div), so the universal sweep would
    // see "empty typeahead", retype into it and WIPE the selection we just made
    // (that's exactly what blanked Location/Hispanic/Veteran on Greenhouse).
    await input.evaluate((n) => n.setAttribute('data-applica-filled', '1')).catch(() => undefined);
    await this.pickComboOption(page, input, value, id, log, countryHint);
  }

  /**
   * Type into a combobox-style input (text field + suggestion list) and COMMIT a
   * real option. Free text that never picks an option is CLEARED by these widgets
   * on blur - that's how "Panama City" ended up as a blank Location. Matching
   * order (doc regla 7): exacto normalizado -> frase contenida -> solape de
   * palabras COMPLETAS (nunca substring: "male" dentro de "Female") -> teclado
   * (primera opción). Verifica el commit; si no comprometió, limpia y lo deja
   * para el usuario (el banner lo cuenta como faltante).
   */
  private async pickComboOption(
    page: import('playwright').Page,
    input: import('playwright').Locator,
    rawValue: string,
    what: string,
    log: (m: string) => void,
    countryHint?: string,
  ): Promise<boolean> {
    // Bank answers can be bilingual ("Male | Masculino") - each side is a variant.
    // Also translate common Spanish demographic terms to the English the lists use.
    const ES2EN: Array<[RegExp, string]> = [
      [/^\s*(masculino|hombre)\s*$/i, 'Male'],
      [/^\s*(femenino|mujer)\s*$/i, 'Female'],
      [/^\s*s[ií]\s*$/i, 'Yes'],
    ];
    // Voluntary demographic with no bank answer: open the menu WITHOUT typing
    // (the full list shows) and click the "decline to answer" option directly.
    if (rawValue === DECLINE_ANSWER) {
      await input.click().catch(() => undefined);
      const lb = ((await input.getAttribute('aria-controls').catch(() => null)) || (await input.getAttribute('aria-owns').catch(() => null)) || '').replace(/"/g, '');
      const root = lb ? page.locator(`[id="${lb}"]`) : page;
      let decl = root.locator('[role="option"]').filter({ hasText: DECLINE_OPTION_RX }).first();
      for (let w = 0; w < 10 && !(await decl.count().catch(() => 0)); w++) { await page.waitForTimeout(300); decl = root.locator('[role="option"]').filter({ hasText: DECLINE_OPTION_RX }).first(); }
      if (await decl.count().catch(() => 0)) {
        await decl.click().catch(() => undefined);
        await page.waitForTimeout(300);
        if (await input.evaluate((n: any) => { let anc = n.parentElement; for (let up = 0; up < 4 && anc; up++) { const sv = anc.querySelector('[class*="single-value" i], [class*="multi-value" i]'); if (sv && (sv.textContent || '').trim()) return true; anc = anc.parentElement; } return false; }).catch(() => false)) {
          await input.evaluate((n) => n.setAttribute('data-applica-filled', '1')).catch(() => undefined);
          log(`${what}: pregunta voluntaria - elegí "prefiero no responder".`);
          return true;
        }
      }
      await input.press('Escape').catch(() => undefined);
      return false;
    }

    let variants = String(rawValue).split(/\s*\|\s*/).map((v) => v.trim()).filter(Boolean);
    variants = variants.concat(variants.map((v) => { for (const [re, en] of ES2EN) if (re.test(v)) return en; return ''; }).filter(Boolean));
    if (!variants.length) return false;
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

    // "Committed" = react-select's single-value div has text. It is a SIBLING of
    // the input's own container (control > value-container > [single-value,
    // input-container > input]), so a closest() from the input matches the
    // input-container first and never sees it - walk a few ancestors instead.
    // The typed-but-unpicked text also lives in n.value, so n.value alone is NOT
    // commitment for react-select; check single-value FIRST.
    const isCommitted = () => input.evaluate((n: any) => {
      let anc = n.parentElement;
      for (let up = 0; up < 4 && anc; up++) {
        const sv = anc.querySelector('[class*="single-value" i], [class*="multi-value" i]');
        if (sv && (sv.textContent || '').trim()) return true;
        anc = anc.parentElement;
      }
      // Non-react-select combobox: the picked value stays in the input and the
      // menu closes. Typed-but-unpicked text keeps the menu open (aria-expanded).
      return !!(n.value && n.value.trim()) && n.getAttribute('aria-expanded') !== 'true';
    }).catch(() => false);

    // Type only up to the first comma: "Panama City, Provincia de Panamá, Panama"
    // confuses the remote geocoder (it returned Florida first) while "Panama City"
    // nails it. Enum options (veteran etc.) don't contain commas - unaffected.
    const base = variants[0].split(',')[0].trim();
    // Country guard for location-like values ("City, ..., Country"): the option's
    // country (its LAST comma segment) must equal the value's. The es-locale
    // geocoder localizes place names ("Ciudad de Panamá") so searching the
    // English name only returns US lookalikes - without this guard we committed
    // "Panama City Beach, Florida" for a Panama profile.
    // Country names differ per locale ("United States" vs "Estados Unidos") -
    // canonicalize before comparing tails.
    const canonCountry = (s: string) => {
      const n = norm(s);
      if (/^(united states( of america)?|estados unidos|usa|us|ee ?uu)$/.test(n)) return 'us';
      if (/^(brazil|brasil)$/.test(n)) return 'br';
      return n;
    };
    // Value without a country ("Panama City" learned bare) can't anchor the
    // guard - fall back to the PROFILE country, or "Panama City" happily picks
    // Florida again ("panama city" is contained in the Florida option's text).
    const vTail = variants[0].includes(',') ? norm(variants[0].split(',').pop() || '') : (countryHint ? norm(countryHint) : '');
    // LIST-FIRST, typing only as fallback: '' opens the menu WITHOUT typing -
    // static enum lists (gender, veteran, sponsorship...) render every option on
    // click, so we match directly with ZERO keystrokes (instant, and nothing
    // "types like crazy" in front of the user). Remote lists (geocoder) show
    // nothing until you type -> fall through the query ladder: full city ->
    // es exonym bridge ("X City" -> "Ciudad de X") -> first word.
    const queries = ['', base.slice(0, 30)];
    const mCity = base.match(/^(.+?)\s+city$/i);
    if (mCity) queries.push(`Ciudad de ${mCity[1]}`);
    queries.push(base.split(/\s+/)[0]);
    let prevTyped = '';
    for (const typed of queries) {
      if (typed && typed === prevTyped) continue;
      if (typed) prevTyped = typed;
      await input.click().catch(() => undefined);
      if (typed) {
        await input.fill('').catch(() => undefined);
        await input.type(typed, { delay: 40 }).catch(() => undefined);
      }

      // Scope options to THIS combobox's own listbox (react-select exposes it as
      // aria-controls="react-select-<field>-listbox" while open). A global
      // [role="option"] locator picks up a PREVIOUS field's still-open menu -
      // that's how filling Location once clicked a COUNTRY option ("Panama +507").
      await page.waitForTimeout(250);
      const listboxId = (await input.getAttribute('aria-controls').catch(() => null))
        || (await input.getAttribute('aria-owns').catch(() => null)) || '';
      const clean = listboxId.replace(/"/g, '');
      const optLoc = clean
        ? page.locator(`[id="${clean}"] [role="option"], [id^="${clean.replace(/-listbox$/, '')}-option"]`)
        : page.locator('[role="option"]');

      // Typed queries can be SLOW (Location is a remote geocoder): poll up to ~4s.
      // The open-only probe gives up fast (~1s) - an empty menu just means the
      // list needs text.
      let raw: Array<{ t: string; link: boolean }> = [];
      for (let w = 0, max = typed ? 14 : 4; w < max; w++) {
        // ONE round-trip for text + link-ness of every row: a per-row evaluate
        // was 250 calls on the country list = seconds of "thinking" idle time.
        raw = await optLoc.evaluateAll((ns) => ns.map((n) => ({
          t: ((n as HTMLElement).innerText || '').trim(),
          link: !!(n.closest && n.closest('a[href]')) || n.tagName === 'A',
        }))).catch(() => []);
        if (raw.length) break;
        await page.waitForTimeout(300);
      }
      if (!raw.length) continue;

      // Leaf rows only (single line, doc §4) and never anchors.
      let rows: Array<{ i: number; t: string }> = [];
      for (let i = 0; i < raw.length; i++) {
        if (!raw[i].t || raw[i].t.includes('\n') || raw[i].link) continue;
        rows.push({ i, t: raw[i].t });
      }
      if (!rows.length) continue;

      // Apply the country guard only when the list looks geographic (comma-ed
      // rows). No row from the right country -> try the NEXT query, never pick a
      // wrong-country lookalike.
      if (vTail && rows.filter((r) => r.t.includes(',')).length >= rows.length / 2) {
        rows = rows.filter((r) => canonCountry(r.t.split(',').pop() || '') === canonCountry(vTail));
        if (!rows.length) continue;
      }

      const nv = variants.map(norm);
      let pick = -1;
      for (const r of rows) if (nv.includes(norm(r.t))) { pick = r.i; break; } // exact
      if (pick < 0) { // contained phrase, either direction
        for (const r of rows) { const nt = norm(r.t); if (nv.some((v) => v.length >= 3 && (nt.includes(v) || v.includes(nt)))) { pick = r.i; break; } }
      }
      if (pick < 0) { // whole-word overlap, scored by PROPORTION of the option covered
        // Raw counts tie ("Panama City Beach, Florida, Estados Unidos" vs "Ciudad
        // de Panamá, Provincia de Panamá" both share 2 words with the bank value)
        // and the geocoder lists Florida FIRST in es locale. Dividing by the
        // option's own word count penalizes options full of words we don't know.
        const vwords = new Set(nv.flatMap((v) => v.split(/[^a-z0-9]+/)).filter((w) => w.length >= 3));
        let best = 0;
        for (const r of rows) {
          const ow = norm(r.t).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
          if (!ow.length) continue;
          const common = ow.filter((w) => vwords.has(w)).length;
          if (!common) continue;
          const score = common / ow.length;
          if (score > best) { best = score; pick = r.i; }
        }
      }

      // Fallback = first row that SURVIVED the leaf/link/country guards - never
      // ArrowDown+Enter, which commits the raw menu's first option and can pick
      // exactly what the country guard just rejected. ONLY for typed queries: on
      // the open-only probe the rows are the raw unfiltered list, and "first
      // option" there is an arbitrary enum value, not a search result.
      if (pick < 0 && rows.length && typed) pick = rows[0].i;
      if (pick < 0) continue;
      await optLoc.nth(pick).click().catch(() => undefined);
      await page.waitForTimeout(400);
      if (await isCommitted()) {
        await input.evaluate((n) => n.setAttribute('data-applica-filled', '1')).catch(() => undefined);
        log(`Selected ${what} = ${raw[pick].t}`);
        return true;
      }
    }
    // Never leave uncommitted free text (the widget clears it on blur anyway and
    // meanwhile it hides the "missing field" signal from the banner), and CLOSE
    // the menu: a menu left open poisons the option scan of the next field.
    await input.fill('').catch(() => undefined);
    await input.press('Escape').catch(() => undefined);
    log(`${what}: no encontré opción en la lista para "${rawValue}" - queda para el usuario.`);
    return false;
  }

  private async fillQuestionByLabel(page: import('playwright').Page, question: string, answer: string, log: (m: string) => void = () => {}, countryHint?: string) {
    // Match REAL <label> elements, not any text on the page: the bank key "Major"
    // matched the legal paragraph "...one or more of your 'major life activities'"
    // and typed the Major answer (Bloomberg...) into the DISABILITY multiselect.
    // Short keys ("To") match everywhere - require some substance.
    if (question.trim().length < 4) return false;
    let label = page.locator('label').filter({ hasText: question }).first();
    if (!(await label.count())) {
      // Fallback for question text not inside a <label>: only SHORT text nodes
      // (a real field caption, never a paragraph that happens to contain the key).
      label = page.getByText(question, { exact: false }).first();
      if (!(await label.count())) return false;
      const len = await label.evaluate((n) => ((n as HTMLElement).innerText || '').length).catch(() => 9999);
      if (len > Math.max(question.length * 2, 120)) return false;
    }
    // The caption must START with the question, not merely contain it: "Major"
    // kept matching mid-sentence in "...one or more of your 'major life
    // activities'" and typed Bloomberg into the disability widget.
    const startsWithQ = await label.evaluate((n, q) => {
      const t = ((n as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return t.startsWith(q.replace(/\s+/g, ' ').trim().toLowerCase());
    }, question).catch(() => false);
    if (!startsWithQ) return false;

    const fieldId = await label.getAttribute('for');
    if (fieldId) {
      // Attribute selector, not `#id`: Greenhouse generates NUMERIC ids ("9120…"),
      // and `#9120` is invalid CSS - the SyntaxError aborted the whole fill pass.
      const field = page.locator(`[id="${fieldId.replace(/"/g, '')}"]`).first();
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
        // Combobox (text input + suggestion list): plain fill()+blur types free
        // text the widget CLEARS on blur - it must go through the option picker.
        // The known Greenhouse ids are comboboxes even when no aria hints exist.
        const isCombo = /^(country|candidate-location|gender|hispanic_ethnicity|veteran_status|disability_status)$/.test(fieldId)
          || await field.evaluate((el) => el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list'
            || !!el.getAttribute('aria-haspopup') || el.hasAttribute('aria-expanded')
            || !!(el.closest && el.closest('[class*="select__" i], [class*="react-select" i], [class*="combobox" i], [class*="autocomplete" i]'))).catch(() => false);
        if (isCombo) {
          // A list option is never a paragraph: AI-prose answers (>60 chars) only
          // waste ~9s typing into the widget and always fail - skip so the
          // dedicated typeahead pass fills it from the clean profile value.
          if (answer.trim().length > 60) return false;
          await field.evaluate((n) => n.setAttribute('data-applica-filled', '1')).catch(() => undefined);
          const ok = await this.pickComboOption(page, field, answer, question, log, countryHint);
          // A failed pick must RELEASE the mark: the bank answer can be junk (AI
          // prose for Location) while the dedicated fillTypeahead pass right after
          // holds a clean profile value - the stale mark was blocking that retry.
          if (!ok) await field.evaluate((n) => n.removeAttribute('data-applica-filled')).catch(() => undefined);
          return ok;
        }
        await field.fill(answer);
        await field.evaluate((el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); (el as HTMLElement).blur(); }).catch(() => undefined);
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

    const textField = container.locator('textarea, input[type="text"], input[type="tel"], input:not([type])').first();
    if (await textField.count()) {
      await textField.fill(answer);
      // Greenhouse renders some required fields (Country, School, Degree…) as
      // typeahead autocompletes - a plain fill leaves them "unselected". If an
      // options list appears, pick the best match (or the first option).
      try {
        await textField.page().waitForTimeout(450);
        const options = textField.page().locator('[role="option"], .select__option, li[id*="option" i], .autocomplete__option');
        if (await options.count() > 0) {
          const exact = options.filter({ hasText: new RegExp(`^\\s*${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') }).first();
          if (await exact.count()) await exact.click({ timeout: 2000 }).catch(() => undefined);
          else await options.first().click({ timeout: 2000 }).catch(() => undefined);
        }
      } catch { /* not an autocomplete - the plain fill is fine */ }
      return true;
    }

    return false;
  }

  private async waitForSubmissionOutcome(page: import('playwright').Page) {
    const successSignals = [
      /thank you for applying/i,
      /application submitted/i,
      /we have received your application/i,
    ];
    const errorSelectors = [
      '.field-error',
      '.error',
      '[role="alert"]',
    ];

    await page.waitForTimeout(2500);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (successSignals.some((pattern) => pattern.test(bodyText))) {
      return { success: true, reason: 'Greenhouse showed a success confirmation' };
    }

    for (const selector of errorSelectors) {
      const messages = await page.locator(selector).allInnerTexts().catch(() => []);
      const meaningful = messages.map((message) => message.trim()).filter(Boolean);
      if (meaningful.length > 0) {
        return { success: false, reason: meaningful.join(' ') };
      }
    }

    return { success: false, reason: 'Greenhouse did not expose a clear success confirmation' };
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






