import { ApplicationFormPreview, FormFieldPreview, InspectApplicationContext, PlatformAdapter, SearchFilters } from './PlatformAdapter';
import { NormalizedVacancy } from '../scoring/fitScorer';
import { ApplicationSubmission } from '@/db/schema';
import { getRoleFamily, roleMatches } from '../scoring/roleTaxonomy';
import { createIncognitoContext } from '../automation/browserManager';
import { detectRemoteScope, inferModality, matchesCountry } from '../scoring/geography';
import { isLikelyFalsePositiveRole } from '../scoring/semanticRole';
import { fillEverythingKnown } from './universalFill';

export class LeverAdapter implements PlatformAdapter {
  name = 'lever';

  async search(filters: SearchFilters): Promise<NormalizedVacancy[]> {
    const boardTokens = filters.boardTokens ?? [];
    if (boardTokens.length === 0) return [];

    let scannedSources = 0;
    const allJobs = await this.mapWithConcurrency(boardTokens, 20, async (token) => {
      const res = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json`);
      scannedSources += 1;
      if (filters.onProgress && (scannedSources % 100 === 0 || scannedSources === boardTokens.length)) {
        await filters.onProgress({ scannedSources, totalSources: boardTokens.length });
      }
      if (!res.ok) {
        console.warn(`[Lever] Failed to fetch board ${token}: ${res.status}`);
        return [];
      }
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map((job: any) => this.normalizeJob(job, token));
    });

    return allJobs
      .flat()
      .filter((job) => this.matchesFilters(job, filters))
      .sort((a, b) => this.searchRank(b, filters) - this.searchRank(a, filters))
      .slice(0, filters.limit ?? 10);
  }

  async extractVacancy(url: string): Promise<NormalizedVacancy | null> {
    const match = url.match(/(?:jobs|api)\.lever\.co\/(?:v0\/postings\/)?([^/]+)\/([^/]+)/i);
    if (!match) return null;

    const [, boardToken, jobId] = match;
    const res = await fetch(`https://api.lever.co/v0/postings/${boardToken}/${jobId}`);
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
      '[Lever] apply() is not implemented. Use applyPlaywright() for real submissions via browser automation.'
    );
  }

  async inspectApplicationFormPlaywright(
    url: string,
    context: InspectApplicationContext,
  ): Promise<ApplicationFormPreview> {
    const browserContext = await createIncognitoContext();
    const page = await browserContext.newPage();

    const applyUrl = url.endsWith('/apply') ? url : `${url}/apply`;

    try {
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('form, input[name="name"]', { state: 'visible', timeout: 10000 });

      const captchaDetected = await this.isCaptchaPresent(page);
      const rawFieldsAll = await page.locator('input, select, textarea').evaluateAll((elements) =>
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
            const type = input.getAttribute('type') || input.tagName.toLowerCase();
            const isChoice = type === 'radio' || type === 'checkbox';
            // For radio/checkbox the per-option <label> is the OPTION, not the
            // question - use the surrounding question block's label instead so we
            // don't emit one "field" per option (e.g. each country/Yes/No).
            const questionEl = input.closest('.application-question, fieldset, li, .application-field');
            const questionLabel = isChoice
              ? (questionEl?.querySelector('.application-label, label, legend, .text')?.textContent || '')
              : '';
            const directLabel =
              (id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : '') ||
              input.closest('label')?.textContent ||
              input.parentElement?.parentElement?.querySelector('label')?.textContent ||
              input.parentElement?.previousElementSibling?.textContent ||
              '';
            const label = (questionLabel || directLabel || input.getAttribute('aria-label') || input.getAttribute('placeholder') || name || id || 'Campo sin etiqueta')
              .replace(/\s+/g, ' ').trim();
            return {
              id, name, type, isChoice, label,
              required: input.required || input.getAttribute('aria-required') === 'true' || (input.closest('.application-question')?.querySelector('.required-text') !== null),
            };
          }),
      );

      // Collapse radio/checkbox groups (same name) into a single question.
      const seenChoiceGroups = new Set<string>();
      const rawFields = rawFieldsAll.filter((f) => {
        if (!f.isChoice) return true;
        const key = f.name || f.label;
        if (seenChoiceGroups.has(key)) return false;
        seenChoiceGroups.add(key);
        return true;
      });

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
    const applyUrl = url.endsWith('/apply') ? url : `${url}/apply`;

    const logs: Array<{ timestamp: string; level: string; message: string }> = [];
    const log = (msg: string) => {
      console.log(`[Lever] ${msg}`);
      logs.push({ timestamp: new Date().toISOString(), level: 'info', message: msg });
    };

    log('Locating form fields...');

    if (page.url() !== applyUrl) {
      await page.goto(applyUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }

    const name = profileData.name || `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim() || 'Applicant';
    const email = profileData.email || '';
    const rawPhone = String(profileData.phone || '');
    const phone = (rawPhone.replace(/\D/g, '').length >= 7) ? rawPhone : '+507 6000-0000';
    const linkedin = profileData.linkedin || '';

    await page.waitForSelector('form, input[name="name"]', { state: 'visible', timeout: 15000 });

    // Resume first so Lever's "auto-read resume" parse doesn't clobber our fields.
    log(`Attaching resume from ${resumePath}`);
    const fileInput = page.locator('input[type="file"][name="resume"], input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(resumePath).catch((e) => log(`Resume warn: ${(e as Error).message}`));
      await page.waitForTimeout(3000);
      log('Resume attached');
    } else log('No resume input found - continuing');

    const commit = async (loc: import('playwright').Locator) => {
      await loc.evaluate((el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); (el as HTMLElement).blur(); }).catch(() => undefined);
    };
    const setVal = async (sel: string, val: string, label: string) => {
      if (!val) return;
      const el = page.locator(sel).first();
      if (await el.count()) { await el.fill(val).catch(() => undefined); await commit(el); log(`Filled ${label}`); }
    };
    await setVal('input[name="name"]', name, 'full name');
    await setVal('input[name="email"]', email, 'email');
    await setVal('input[name="phone"]', phone, 'phone');
    await setVal('input[name="org"]', profileData.company || 'N/A', 'current company');
    await setVal('input[name="urls[LinkedIn]"], input[name="urls[Linkedin]"]', linkedin, 'LinkedIn');

    // Current location autocomplete.
    await this.fillLeverLocation(page, profileData, log);

    // Custom "cards[...]" questions (radio/select/textarea/checkbox) by label.
    const filled = await this.fillLeverCards(page, formAnswers ?? {}, profileData, log);
    log(`Filled ${filled} custom card field(s)`);

    // Final sweep: fill any other labeled field we recognize from profile + bank.
    await fillEverythingKnown(page, profileData, { ...(formAnswers ?? {}) }, log);

    // Required consent checkboxes (privacy policy etc.).
    const consents = page.locator('input[type="checkbox"][required], input[name="consent[store]"]');
    const cn = await consents.count().catch(() => 0);
    for (let i = 0; i < cn; i++) await consents.nth(i).check().catch(() => undefined);
    if (cn) log(`Checked ${cn} required consent(s)`);

    // Assisted mode: form is filled - leave it for the user (captcha + submit). Skip
    // the extra post-fill evaluate passes (fix-up + diagnostics): on constrained
    // hosts the heavy dLocal DOM + hCaptcha can crash the tab there, and the user
    // reviews the form anyway before submitting.
    if (context.fillOnly) {
      log('Formulario lleno (modo asistido) - listo para que el usuario complete captcha + envíe.');
      return { status: 'pending_review', submissionStatus: 'assisted_ready', logs };
    }

    // Fix-up pass: re-check any required radio/checkbox group still unchecked and
    // click an option (handles the timing flakiness of styled Lever controls).
    await this.ensureRequiredChoices(page, log);
    await this.logUnfilledRequired(page, log);

    log('Locating Submit button...');
    const submitBtn = page.locator('button.postings-btn[type="submit"]').first()
      .or(page.getByRole('button', { name: /submit application/i }).first());
    if (!(await submitBtn.count())) throw new Error('Submit button not found');
    if (process.env.ENABLE_REAL_SUBMISSIONS !== 'true') {
      log('Submit located (dry-run: not clicked)');
      return { status: 'approved', submissionStatus: 'dry_run', logs };
    }
    await submitBtn.scrollIntoViewIfNeeded().catch(() => undefined);
    await submitBtn.click();
    log('Submit clicked');
    const confirmation = await this.waitForSubmissionOutcome(page);
    if (confirmation.success) {
      log(`Submission confirmed: ${confirmation.reason}`);
      return { status: 'submitted', submissionStatus: 'success', submittedAutomatically: true, logs };
    }
    // Lever (e.g. dLocal) triggers an image CAPTCHA on submit. We don't defeat it -
    // detect it and hand off to assisted-manual: the form is fully prepared.
    const captcha = await page.evaluate(() =>
      document.querySelectorAll('iframe[src*="hcaptcha"], iframe[src*="recaptcha"], iframe[src*="funcaptcha"], iframe[src*="arkose"]').length > 0
      || /select (all|items|each)|verify you (are|’re) human|press & hold|i am human/i.test(document.body?.innerText || ''),
    ).catch(() => false);
    if (captcha) {
      log('Human-verification challenge (CAPTCHA) on submit - form prepared; handing off for human verification + submit.');
      return {
        status: 'pending_review',
        submissionStatus: 'failed_captcha',
        failureReason: 'Formulario listo. Esta empresa exige verificación humana (CAPTCHA) al enviar: abre la oferta y da el último clic - Applica ya llenó todo.',
        logs,
      };
    }
    throw new Error(confirmation.reason ?? 'Submission outcome could not be confirmed');
  }

  /** Lever current-location typeahead: type, pick a suggestion if one appears,
   * otherwise keep the typed text (do NOT press Enter - Lever clears the field
   * when Enter lands on a "no location found" state). */
  private async fillLeverLocation(page: import('playwright').Page, profileData: any, log: (m: string) => void) {
    const input = page.locator('input[name="location"], input#location, input[placeholder*="location" i]').first();
    if (!(await input.count())) return;
    const city = profileData.city || profileData.location || 'Panama City';
    await input.click().catch(() => undefined);
    await input.fill('').catch(() => undefined);
    await input.type(city, { delay: 60 }).catch(() => undefined);
    // Poll up to ~8s for a real geo suggestion (Lever's lookup is slow).
    const optSel = '.dropdown-location__option, .dropdown-location li, .pac-item, [class*="dropdown" i] [class*="option" i], li[role="option"]';
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(1000);
      const opts = page.locator(optSel);
      const n = await opts.count().catch(() => 0);
      for (let j = 0; j < n; j++) {
        const txt = (await opts.nth(j).innerText().catch(() => '')) || '';
        if (txt && !/no location|loading|try entering/i.test(txt) && /[a-z]/i.test(txt)) {
          await opts.nth(j).click().catch(() => undefined);
          log(`Selected location ${txt.trim().slice(0, 40)}`);
          return;
        }
      }
    }
    // Keyboard fallback: the list may have rendered with markup our selectors don't
    // know; ArrowDown+Enter picks its top entry anyway.
    await input.press('ArrowDown').catch(() => undefined);
    await input.press('Enter').catch(() => undefined);
    await page.waitForTimeout(800);
    const picked = await input.inputValue().catch(() => '');
    if (picked && picked.length > city.length) { log(`Location picked via keyboard: ${picked.slice(0, 40)}`); return; }
    // Last resort: keep the typed text and DON'T blur - Lever wipes free text on
    // blur when no suggestion was chosen (that's how the field ended up empty).
    if (!picked) await input.fill(city).catch(() => undefined);
    log(`Location kept as typed ${city} (no geo suggestion)`);
  }

  /**
   * Re-check every required radio/checkbox group that still has nothing selected
   * and click an option (default: first, or 'Yes' for a Yes/No). Runs a couple of
   * passes because Lever's styled controls occasionally drop a programmatic click.
   */
  private async ensureRequiredChoices(page: import('playwright').Page, log: (m: string) => void) {
    for (let pass = 0; pass < 2; pass++) {
      const unchecked: string[] = await page.evaluate(() => {
        const names = new Set<string>();
        const checked = new Set<string>();
        for (const el of Array.from(document.querySelectorAll('input[type="radio"], input[type="checkbox"]'))) {
          const i = el as HTMLInputElement;
          const req = i.required || i.getAttribute('aria-required') === 'true' || /✱|\*/.test(i.closest('.application-question, .application-field')?.textContent || '');
          if (!req) continue;
          if (i.name.startsWith('consent[')) continue;
          names.add(i.name);
          if (i.checked) checked.add(i.name);
        }
        return [...names].filter((n) => !checked.has(n));
      });
      if (!unchecked.length) { if (pass === 0) log('All required choices already set'); return; }
      for (const name of unchecked) {
        const kind = (await page.locator(`input[type="checkbox"][name="${name}"]`).count()) ? 'checkbox' : 'radio';
        const picked = await this.clickLeverOption(page, name, 'Yes', kind);
        await page.waitForTimeout(150);
        log(`Fix-up: set required choice [${name.slice(0, 24)}…] ${picked}`);
      }
    }
  }

  /** Log required fields that are still empty / radio-groups with nothing checked. */
  private async logUnfilledRequired(page: import('playwright').Page, log: (m: string) => void) {
    const missing = await page.evaluate(() => {
      const out: string[] = [];
      const radioGroups = new Map<string, { any: boolean; label: string }>();
      for (const el of Array.from(document.querySelectorAll('input, select, textarea'))) {
        const i = el as HTMLInputElement;
        if (i.type === 'hidden' || i.type === 'file') continue;
        const req = i.required || i.getAttribute('aria-required') === 'true' || /✱|\*/.test(i.closest('.application-question, .application-field')?.textContent || '');
        if (!req) continue;
        const label = (i.closest('.application-question, .application-field')?.querySelector('.application-label, .text, label')?.textContent || i.name || '').replace(/\s+/g, ' ').replace(/✱|\*/g, '').trim().slice(0, 45);
        if (i.type === 'radio' || i.type === 'checkbox') {
          const g = radioGroups.get(i.name) || { any: false, label };
          if (i.checked) g.any = true;
          radioGroups.set(i.name, g);
        } else if (!i.value?.trim()) out.push(label);
      }
      for (const [, g] of radioGroups) if (!g.any) out.push(g.label + ' [choice]');
      return [...new Set(out)];
    });
    if (missing.length) log(`STILL MISSING required: ${JSON.stringify(missing)}`);
    else log('All required fields satisfied');
    return missing;
  }

  /**
   * Fill Lever's custom application questions. Each question is a ".application-
   * question" card; controls are named cards[uuid][fieldN]. Radio/checkbox options
   * share a name - we group them, read the question label, and pick the answer.
   */
  private async fillLeverCards(page: import('playwright').Page, formAnswers: Record<string, string>, profileData: any, log: (m: string) => void): Promise<number> {
    const groups = await page.evaluate(() => {
      const out: any[] = [];
      const seen = new Set<string>();
      for (const card of Array.from(document.querySelectorAll('.application-question, li.application-question, [class*="application-question" i]'))) {
        const qLabel = (card.querySelector('.application-label, .text, label, legend') as HTMLElement)?.innerText?.replace(/\s+/g, ' ').trim().replace(/✱|\*/g, '').trim() || '';
        for (const el of Array.from(card.querySelectorAll('input, select, textarea'))) {
          const i = el as HTMLInputElement;
          if (i.type === 'hidden' || i.type === 'file') continue;
          const key = `${i.name}|${i.type}`;
          if ((i.type === 'radio' || i.type === 'checkbox') && seen.has(i.name)) continue;
          if (i.type === 'radio' || i.type === 'checkbox') seen.add(i.name);
          if (seen.has(key) && i.type !== 'radio' && i.type !== 'checkbox') continue;
          out.push({ kind: i.tagName.toLowerCase() === 'select' ? 'select' : (i.type === 'radio' ? 'radio' : i.type === 'checkbox' ? 'checkbox' : 'text'), name: i.name, label: qLabel, required: i.required || i.getAttribute('aria-required') === 'true' || /✱|\*/.test(card.textContent || '') });
        }
      }
      return out;
    });

    let count = 0;
    for (const g of groups) {
      if (g.name === 'name' || g.name === 'email' || g.name === 'phone' || g.name === 'org' || g.name === 'location' || /urls\[/.test(g.name) || /consent\[/.test(g.name)) continue;
      const answer = this.resolveLeverAnswer(g.label, formAnswers, profileData, g);
      if (!answer && !g.required) continue;
      try {
        if (g.kind === 'text') {
          const el = page.locator(`[name="${g.name}"]`).first();
          if (await el.count()) { await el.first().fill(answer || 'N/A'); await el.first().evaluate((n) => { n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); (n as HTMLElement).blur(); }).catch(() => undefined); count++; log(`Filled "${g.label.slice(0, 40)}"`); }
        } else if (g.kind === 'select') {
          const el = page.locator(`select[name="${g.name}"]`).first();
          await el.selectOption({ label: answer }).catch(async () => {
            // pick the first real (non-placeholder) option
            await el.selectOption({ index: 1 }).catch(() => undefined);
          });
          count++; log(`Selected "${g.label.slice(0, 40)}"`);
        } else if (g.kind === 'radio' || g.kind === 'checkbox') {
          const picked = await this.clickLeverOption(page, g.name, answer, g.kind);
          count++; log(`Answered ${g.kind} "${g.label.slice(0, 40)}" ${picked}`);
        }
      } catch (e) {
        log(`Could not fill "${g.label.slice(0, 40)}": ${(e as Error).message}`);
      }
    }
    return count;
  }

  /**
   * Pick the radio/checkbox option (by visible label) matching the answer; default
   * to first. Lever renders styled controls where the real <input> is hidden and
   * the click must land on its <label> - force-checking the input doesn't fire
   * Lever's handler, so we click the label element in-page and verify it took.
   */
  private async clickLeverOption(page: import('playwright').Page, name: string, answer: string, kind: string): Promise<string> {
    // Read each option's visible label (read-only) to choose the index.
    const labels: string[] = await page.evaluate(({ groupName, k }) => {
      const els = Array.from(document.querySelectorAll(`input[type="${k}"][name="${groupName}"]`)) as HTMLInputElement[];
      return els.map((i) => ((i.closest('label') as HTMLElement)?.innerText
        || (i.id ? (document.querySelector(`label[for="${i.id}"]`) as HTMLElement)?.innerText : '')
        || (i.parentElement as HTMLElement)?.innerText
        || i.value || '').replace(/\s+/g, ' ').trim());
    }, { groupName: name, k: kind });
    if (!labels.length) return 'no options';
    let idx = -1;
    if (answer) {
      const re = new RegExp(`^\\s*${answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
      idx = labels.findIndex((l) => re.test(l));
      if (idx < 0) idx = labels.findIndex((l) => l.toLowerCase().includes(answer.toLowerCase()) || answer.toLowerCase().includes(l.toLowerCase()));
    }
    if (idx < 0) idx = 0;
    // Real Playwright click on the option's clickable container (label/li/parent),
    // which fires the gesture Lever's classic form expects.
    const input = page.locator(`input[type="${kind}"][name="${name}"]`).nth(idx);
    const targets = [
      input.locator('xpath=ancestor::label[1]'),
      input.locator('xpath=ancestor::*[self::li or contains(@class,"application-answer")][1]'),
      input.locator('xpath=following-sibling::label[1]'),
      input,
    ];
    for (const t of targets) {
      if (await t.count().catch(() => 0)) {
        await t.first().click({ force: true }).catch(() => undefined);
        if (await input.isChecked().catch(() => false)) break;
      }
    }
    if (!(await input.isChecked().catch(() => false))) await input.check({ force: true }).catch(() => undefined);
    return labels[idx] || `option ${idx}`;
  }

  /** Resolve an answer for a Lever card question. */
  private resolveLeverAnswer(label: string, formAnswers: Record<string, string>, profileData: any, g: any): string {
    const norm = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
    const saved = Object.entries(formAnswers).find(([q]) => {
      const qn = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[✱*]/g, '').replace(/\s+/g, ' ').trim();
      return qn === norm || (qn.length > 8 && (qn.includes(norm) || norm.includes(qn)));
    });
    if (saved && saved[1]) return saved[1];
    const l = norm;
    if (/which location are you applying|available to work in a hybrid|listed locations/.test(l)) return 'I do not live in any of those locations';
    if (/salary expectations are/.test(l)) return 'Annual';
    if (/desired salary|gross.*salary|salary.*local currency/.test(l)) return '60000';
    if (/how did you (get to know|hear)/.test(l)) return 'LinkedIn';
    if (/legally auth|authorised to work|authorized to work|right to work/.test(l)) return 'Yes';
    if (/consent.*ai tools|ai tools.*transcript/.test(l)) return 'I give my consent';
    if (/visa|sponsorship/.test(l)) return 'No';
    if (/linkedin/.test(l)) return profileData.linkedin || '';
    if (/notice period|when can you start|availability/.test(l)) return 'Immediately available / 2 weeks';
    if (/years? of experience/.test(l)) return '10';
    if (/consent|agree|privacy|policy/.test(l)) return 'Yes';
    if (g?.kind === 'radio' || g?.kind === 'checkbox') return g.required ? 'Yes' : '';
    if (g?.required) return 'N/A';
    return '';
  }

  private normalizeJob(job: any, boardToken: string): NormalizedVacancy {
    const description = this.stripHtml(job.descriptionPlain || job.description || '');
    return {
      id: String(job.id),
      platform: this.name,
      externalId: String(job.id),
      title: job.text,
      company: boardToken,
      location: job.categories?.location || job.categories?.commitment,
      modality: inferModality(job.categories?.location),
      description,
      requirements: undefined,
      url: job.hostedUrl,
      postedAt: job.createdAt ? new Date(job.createdAt) : undefined,
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
    ];
    const errorSelectors = [
      '.field-error',
      '.error',
      '.error-message',
      '[role="alert"]',
    ];

    await page.waitForTimeout(2500);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (successSignals.some((pattern) => pattern.test(bodyText))) {
      return { success: true, reason: 'Lever showed a success confirmation' };
    }

    for (const selector of errorSelectors) {
      const messages = await page.locator(selector).allInnerTexts().catch(() => []);
      const meaningful = messages.map((message) => message.trim()).filter(Boolean);
      if (meaningful.length > 0) {
        return { success: false, reason: meaningful.join(' ') };
      }
    }

    return { success: false, reason: 'Lever did not expose a clear success confirmation' };
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
