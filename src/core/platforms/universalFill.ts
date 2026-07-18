import type { Page } from 'playwright';

/**
 * Voluntary demographic / self-identification questions (US Standard Demographic
 * Questions, EEOC self-identification, etc.) are ALWAYS optional. When the bank
 * has no explicit answer, the default across ALL ATS is the "decline to answer"
 * option: faster (no guessing/retrying) and better UX. If the user changes it by
 * hand in the window, silent learning captures THEIR choice as always.
 */
export const DECLINE_ANSWER = '__applica_decline__';
/** Texts that mean "prefer not to answer" across ATS wordings and languages. */
export const DECLINE_OPTION_RX = /decline to (self[- ]?identify|answer|state|disclose)|prefer not to|do ?n[o']?t wish to (answer|self)|don'?t want to answer|i do not (wish|want) to answer|rather not say|prefiero no|no deseo (responder|contestar|decir)|prefiro n[aã]o (responder|informar|declarar)|n[aã]o desejo (responder|informar)/i;
/**
 * Questions that belong to a voluntary demographic / self-identification block.
 * Includes pt-BR equivalents (LGBTQIAPN+, "pessoa com deficiência", "pretas e
 * pardas"...) - found real in a Brazilian Greenhouse posting (Capco) whose
 * diversity checkboxes render in Portuguese, not English, and went unmatched
 * (blocked the application forever with "missing required field" instead of
 * being auto-declined like every other ATS's demographic block).
 */
export const DEMOGRAPHIC_RX = /gender identity|\bgender\b|transgender|sexual orientation|pronouns?|racial|ethnic|\brace\b|hispanic|latino|veteran|disabilit|self[- ]identif|demographic|lgbtqia?p?n?\+?|defici[eê]nc|pretas? e pardas?|pessoas? negras?|ra[cç]a\b|identidade de g[eê]nero|orienta[cç][aã]o sexual|autodeclara[cç][aã]o/i;

/**
 * Generic, label-driven form filler. Instead of hardcoding per-ATS selectors, it
 * walks EVERY visible text/select/textarea on the page, reads each field's label
 * (label[for], wrapping label, aria-label, aria-labelledby, field-group label, or
 * placeholder), and fills it if the label matches something we know: the user's
 * profile (name/email/phone/linkedin/country/city/portfolio) or the reusable
 * answer bank. Only fills EMPTY fields, so it never clobbers values SR/Greenhouse
 * autofilled from the resume. Radios/checkboxes (demographics, consent) are left
 * to each adapter's own logic. Returns how many fields it filled.
 */
export async function fillEverythingKnown(
  page: Page,
  profile: Record<string, any>,
  answers: Record<string, string>,
  log: (m: string) => void,
): Promise<number> {
  // 1. Enumerate fillable fields in the browser and tag each with an index so we
  //    can locate it back from Node. All logic inline (no named fns) to avoid the
  //    esbuild __name injection that breaks page.evaluate under tsx.
  const descriptors = await page.evaluate(() => {
    const out: { idx: number; tag: string; type: string; ta: boolean; name: string; label: string; hasValue: boolean; disabled: boolean }[] = [];
    const skip = ['hidden', 'file', 'submit', 'button', 'reset', 'checkbox', 'radio', 'image', 'password'];
    // Walk into open shadow roots too - SmartRecruiters (SAP "spl-*" components)
    // renders EVERY field inside shadow DOM, and a plain document.querySelectorAll
    // sees none of it (found zero fields on its 2nd/3rd pages, which read as the
    // bot "doing nothing" there). No named helper fns here (only inline loops) -
    // tsx/esbuild can inject a __name() call for named functions passed into
    // page.evaluate, which throws ReferenceError once run standalone in the page.
    const roots: (Document | ShadowRoot)[] = [document];
    const els: Element[] = [];
    while (roots.length) {
      const root = roots.shift()!;
      root.querySelectorAll('input, select, textarea').forEach((e) => els.push(e));
      root.querySelectorAll('*').forEach((e) => { if ((e as any).shadowRoot) roots.push((e as any).shadowRoot); });
    }
    // Strip stale index stamps from EVERY element first (also hidden ones that the
    // filters below skip). Multi-step forms that HIDE the previous page instead of
    // removing it kept old data-applica-f stamps around; a fresh pass re-used the
    // same numbers on the new page and the locator then matched 2 nodes - strict
    // mode violation, silently killing every fill on page 2+.
    for (const e of els) e.removeAttribute('data-applica-f');
    let idx = 0;
    for (const el of els as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]) {
      const tag = el.tagName.toLowerCase();
      const type = (el as HTMLInputElement).type || '';
      if (skip.includes(type)) continue;
      const st = window.getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden' || (el as HTMLInputElement).offsetParent === null) continue;
      // Never refill a field we already filled once: the watch loop re-runs this
      // every ~2s, and if the USER cleared or edited our value (e.g. SR rejected the
      // website format and they deleted it), refilling would fight them in a loop
      // and block the submit. One shot per field; after that it's the user's.
      if (el.getAttribute('data-applica-filled')) continue;
      // Skip react-select / typeahead / autocomplete widgets: their visible input is
      // a search box (empty value) that specialized adapter logic drives. Typing into
      // it here would leave stray text or reopen the dropdown. Also skip readonly.
      if ((el as HTMLInputElement).readOnly) continue;
      // Typeaheads (search-style inputs like SR's "Como você encontrou essa vaga?")
      // aren't skipped anymore - they're flagged and filled with real keystrokes +
      // picking a suggestion, since page 2/3 of SR is full of them and skipping
      // meant "the bot does nothing" there.
      const role = el.getAttribute('role') || '';
      const ta = role === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' || !!el.getAttribute('aria-haspopup')
        || (tag !== 'select' && !!el.closest('[class*="select__" i],[class*="react-select" i],[class*="typeahead" i],[class*="autocomplete" i],[class*="combobox" i]'));
      // Climb out through shadow-root boundaries looking for the label: SR renders
      // the visible label ("First name*") in the OUTER document/light DOM while the
      // actual <input> lives inside the component's shadow root, so a lookup that
      // never leaves the input's own root finds nothing.
      let label = '';
      let node: any = el;
      for (let hop = 0; hop < 4 && !label && node; hop++) {
        const root: any = node.getRootNode ? node.getRootNode() : document;
        if (node.id && root.querySelector) { const l = root.querySelector('label[for="' + CSS.escape(node.id) + '"]'); if (l) label = l.innerText; }
        if (!label && node.closest) { const w = node.closest('label'); if (w) label = w.innerText; }
        if (!label && node.getAttribute) label = node.getAttribute('aria-label') || '';
        if (!label && node.getAttribute) { const lb = node.getAttribute('aria-labelledby'); if (lb && root.getElementById) label = lb.split(' ').map((x: string) => root.getElementById(x)?.innerText || '').join(' '); }
        if (!label && node.closest) { const grp = node.closest('[class*="field" i],[class*="question" i],[class*="form-group" i],[class*="fieldset" i]'); if (grp) { const l = grp.querySelector('label,legend'); if (l) label = l.innerText; } }
        if (!label && node.placeholder) label = node.placeholder;
        // SR's "Preliminary questions" page has NO <label> tied to the field: the
        // question is plain text in a PRECEDING sibling ("Desired Salary / ...",
        // then the component). Associated labels there hold just "*". Walk previous
        // siblings (and up a few ancestors) for the nearest meaningful text line.
        if (!label || label.trim() === '*') {
          let anc: any = node;
          for (let up = 0; up < 4 && (!label || label.trim() === '*') && anc; up++) {
            let sib: any = anc.previousElementSibling;
            while (sib && (!label || label.trim() === '*')) {
              const t = (sib.innerText || '').replace(/\s+/g, ' ').trim();
              if (t && t.length >= 3 && t.length <= 160 && t !== '*') label = t;
              sib = sib.previousElementSibling;
            }
            anc = anc.parentElement;
          }
        }
        if (label && label.trim() === '*') label = '';
        node = root && root.host ? root.host : null;
      }
      el.setAttribute('data-applica-f', String(idx));
      // A COMMITTED typeahead selection can live outside the input (react-select
      // renders it in a sibling div, input stays empty) - and React re-mounts can
      // drop our data-applica-filled mark with the node. Without this check the
      // sweep saw "empty typeahead", retyped free text and WIPED the selection
      // (that's what blanked Location on Greenhouse after a good pick).
      // The single-value div is a SIBLING of the input's own container (control >
      // value-container > [single-value, input-container > input]); closest() from
      // the input matches input-container first and never sees it - walk parents.
      // Multi-selects ("mark all that apply") render committed picks as
      // multi-value CHIPS, not single-value - without checking both, an
      // already-answered multiselect looks empty and gets re-clicked (which
      // TOGGLES the pick off).
      let hv = !!(el as HTMLInputElement).value;
      if (!hv && ta) {
        let anc: any = el.parentElement;
        for (let up = 0; up < 4 && anc && !hv; up++) {
          const sv = anc.querySelector && anc.querySelector('[class*="single-value" i], [class*="multi-value" i]');
          if (sv && (sv.textContent || '').trim()) hv = true;
          anc = anc.parentElement;
        }
      }
      out.push({
        idx, tag, type, ta,
        name: el.getAttribute('name') || '',
        label: (label || '').replace(/\s+/g, ' ').trim().slice(0, 90),
        hasValue: hv,
        disabled: (el as HTMLInputElement).disabled,
      });
      idx++;
    }
    return out;
  }).catch(() => [] as any[]);

  let filled = 0;
  for (const d of descriptors) {
    if (d.disabled || d.hasValue) continue;
    const value = resolveKnown(d.label, d.name, profile, answers);
    if (!value) continue;
    const loc = page.locator(`[data-applica-f="${d.idx}"]`);
    // Our own clicks can trigger a React re-render that wipes every
    // data-applica-f stamp mid-pass; any action on a stale locator then waits
    // its FULL default timeout (30s for evaluate/selectOption) in silence -
    // that read as "minutes frozen doing nothing". A wiped stamp resolves
    // count()=0 instantly: skip, the next tick re-enumerates fresh stamps.
    if (!(await loc.count().catch(() => 0))) continue;
    if (value === DECLINE_ANSWER) {
      // Voluntary demographic question with no bank answer: pick the "decline"
      // option if the widget has one; a free-text demographic stays empty.
      let ok = false;
      if (d.tag === 'select') {
        ok = await loc.evaluate((n: any, rxSrc: string) => {
          const rx = new RegExp(rxSrc, 'i');
          for (const o of Array.from((n as HTMLSelectElement).options)) {
            if (rx.test((o as HTMLOptionElement).text)) {
              (n as HTMLSelectElement).value = (o as HTMLOptionElement).value;
              n.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
          }
          return false;
        }, DECLINE_OPTION_RX.source, { timeout: 2000 }).catch(() => false);
      } else if (d.ta) {
        // Open the menu with a click (empty input lists ALL options) and click
        // the decline row, scoped to this widget's own listbox.
        await loc.click({ timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(900);
        const lb2 = ((await loc.getAttribute('aria-controls', { timeout: 1500 }).catch(() => null)) || (await loc.getAttribute('aria-owns', { timeout: 1500 }).catch(() => null)) || '').replace(/"/g, '');
        const root2 = lb2 ? page.locator(`[id="${lb2}"]`) : page;
        const decl = root2.locator('[role="option"], li, spl-select-option, [class*="option" i]').filter({ hasText: DECLINE_OPTION_RX }).first();
        if (await decl.count().catch(() => 0)) {
          const isLink = await decl.evaluate((n) => !!(n.closest && n.closest('a[href]')) || n.tagName === 'A').catch(() => true);
          if (!isLink) { await decl.click({ timeout: 3000 }).catch(() => undefined); ok = true; }
        }
        if (!ok) await loc.press('Escape', { timeout: 1500 }).catch(() => undefined);
      }
      // Mark even when no decline option exists: it's voluntary - never retry it.
      await loc.evaluate((n) => n.setAttribute('data-applica-filled', '1'), undefined, { timeout: 2000 }).catch(() => undefined);
      if (ok) { filled++; log(`Pregunta voluntaria "${d.label || d.name}": elegí "prefiero no responder".`); }
      continue;
    }
    if (d.tag === 'select') {
      const ok = await loc.selectOption({ label: value }, { timeout: 2500 }).then(() => true).catch(() => false)
        || await loc.selectOption({ value }, { timeout: 1500 }).then(() => true).catch(() => false)
        || await loc.selectOption(value, { timeout: 1500 }).then(() => true).catch(() => false);
      if (!ok) continue;
      await loc.evaluate((n) => n.dispatchEvent(new Event('change', { bubbles: true })), undefined, { timeout: 2000 }).catch(() => undefined);
    } else if (d.ta) {
      // LIST-FIRST, keystrokes only as fallback: pass 0 just OPENS the menu
      // (static enum lists render every option on click - instant match, no
      // "typing like crazy" in front of the user); pass 1 types for remote
      // lists (geocoders) that show nothing until you search.
      // Word-boundary match, NOT substring: typing "Male" must never select
      // "Female | Feminino" (substring 'male' matches inside 'Female').
      const first = value.split(/[\s,|]/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const optSel = '[role="option"], li, spl-select-option, [class*="select-option" i], [class*="option" i], [class*="result" i], [class*="suggestion" i]';
      let clicked = false;
      for (let pass = 0; pass < 2 && !clicked; pass++) {
        await loc.click({ timeout: 3000 }).catch(() => undefined);
        if (pass === 1) {
          await loc.fill('', { timeout: 3000 }).catch(() => undefined);
          // Up to the first comma only: long comma-ed values ("City, Province,
          // Country") confuse remote geocoders into wrong-region suggestions.
          await loc.pressSequentially(value.split(',')[0].trim().slice(0, 40), { delay: 60, timeout: 8000 }).catch(() => undefined);
        }
        // Scope the option scan to THIS widget's own listbox when it exposes one
        // (react-select: aria-controls="...-listbox" while open): a global scan
        // can click an option of ANOTHER field's still-open menu.
        await page.waitForTimeout(pass === 0 ? 500 : 300);
        const lb = ((await loc.getAttribute('aria-controls', { timeout: 1500 }).catch(() => null)) || (await loc.getAttribute('aria-owns', { timeout: 1500 }).catch(() => null)) || '').replace(/"/g, '');
        const optRoot = lb ? page.locator(`[id="${lb}"]`) : page;
        const exact = optRoot.locator(optSel).filter({ hasText: new RegExp('^\\s*' + first + '\\s*([|(].*)?$', 'i') }).first();
        const bounded = optRoot.locator(optSel).filter({ hasText: new RegExp('\\b' + first + '\\b', 'i') }).first();
        // Poll for candidates instead of a fixed 2.2s sleep - enum menus are
        // instant; only the remote search needs the longer window.
        for (let w = 0, max = pass === 0 ? 2 : 7; w < max; w++) {
          if (await exact.count().catch(() => 0) || await bounded.count().catch(() => 0)) break;
          await page.waitForTimeout(300);
        }
        // NEVER click anything that is (or lives inside) a link: a stray match
        // can navigate away from the application (e.g. a cookie-policy page).
        for (const cand of [exact, bounded]) {
          if (clicked || !(await cand.count().catch(() => 0))) continue;
          const isLink = await cand.evaluate((n) => !!(n.closest && n.closest('a[href]')) || n.tagName === 'A').catch(() => true);
          if (isLink) continue;
          await cand.click({ timeout: 3000 }).catch(() => undefined);
          clicked = true;
        }
      }
      // Close a menu that may have stayed open (nothing pickable): left open it
      // poisons the next field's option scan and keeps typed junk visible. No
      // blind ArrowDown+Enter fallback: it commits an arbitrary first option.
      if (!clicked) await loc.press('Escape', { timeout: 1500 }).catch(() => undefined);
    } else {
      await loc.fill(value, { timeout: 3000 }).catch(() => undefined);
      // React needs input/change/blur or it treats the field as empty/untouched.
      await loc.evaluate((n) => { n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true })); (n as HTMLElement).blur(); }, undefined, { timeout: 2000 }).catch(() => undefined);
    }
    // Mark as ours-once so later passes never touch it again (see skip above).
    await loc.evaluate((n) => n.setAttribute('data-applica-filled', '1'), undefined, { timeout: 2000 }).catch(() => undefined);
    filled++;
    log(`Auto-filled "${d.label || d.name}"`);
  }
  if (filled) log(`Universal fill: ${filled} field(s) from known info.`);
  return filled;
}

/** Map a field's label/name to a known value from the profile or answer bank. */
function resolveKnown(label: string, name: string, profile: Record<string, any>, answers: Record<string, string>): string | undefined {
  const hay = `${label} ${name}`.toLowerCase();
  const p = profile || {};
  const full = String(p.name || [p.firstName, p.lastName].filter(Boolean).join(' ')).trim();
  const has = (v: any) => (v != null && String(v).trim() ? String(v).trim() : undefined);

  // Order matters: specific concepts before generic "name".
  if (/mail|correo/.test(hay)) return has(p.email); // email + confirm email + re-enter email
  if (/linked-?in/.test(hay)) return has(p.linkedin);
  if (/github/.test(hay)) return has(p.github);
  // One clean URL only: profiles may store "site1.org, site2.com" but ATS URL
  // fields reject commas/spaces (SR: "cannot contain following characters").
  if (/website|portfolio|portafolio|personal (site|web)|url/.test(hay)) { const pf = has(p.portfolio) || has(p.linkedin); return pf ? pf.split(/[,;\s]+/)[0] : undefined; }
  if (/phone|tel[eé]|mobile|m[oó]vil|celular|whatsapp/.test(hay)) return has(p.phone);
  if (/first ?name|given ?name|primer nombre|forename/.test(hay)) return has(p.firstName) || (full ? full.split(' ')[0] : undefined);
  if (/last ?name|surname|family ?name|apellido/.test(hay)) return has(p.lastName) || (full ? full.split(' ').slice(1).join(' ') || undefined : undefined);
  if (/full name|nombre completo|your name|legal name/.test(hay)) return has(full);
  if (/country|pa[ií]s/.test(hay)) return has(p.country);
  if (/city|ciudad|town/.test(hay)) return has(p.city);
  if (/location|ubicaci|where.*(are|located|based)|domicil|residen/.test(hay)) return has(p.city) || has(p.country);
  if (/\bname\b|nombre/.test(hay)) return has(full);

  // Concept rules for questions every ATS words differently (and in different
  // languages), where strict text matching against the bank fails:
  // salary expectation ("Desired Salary / Expectativa Salarial" vs the bank's
  // "What are your desired salary expectation...") and source-of-application
  // ("Como você encontrou essa vaga?" vs "How did you hear about us?").
  if (/desired salary|salary expectation|expectativa salarial|pretensi[oó]n salarial|expected (compensation|salary)|remuneraci[oó]n (deseada|esperada)/.test(hay)) {
    for (const [q, a] of Object.entries(answers || {})) if (/salar|compensation|remunera/i.test(q)) return has(a);
    return undefined;
  }
  if (/how did you (hear|find|learn)|hear about (us|this)|encontrou (essa|esta) vaga|c[oó]mo (te enteraste|conociste|encontraste)|source of (application|referral)|where did you (hear|find)/.test(hay)) {
    for (const [q, a] of Object.entries(answers || {})) if (/hear about|how did you|encontrou|enteraste|source/i.test(q)) return has(a);
    return 'LinkedIn'; // safe, universally-listed source option
  }

  // Fallback: the reusable answer bank. Exact containment first; then keyword
  // overlap (>=2 significant shared words), since ATSes reword the same question
  // ("Desired salary - Gross (before taxes)" vs "Desired Salary / Expectativa").
  const lbl = label.toLowerCase().trim();
  if (lbl.length >= 5) {
    // Containment must be WHOLE-WORD phrase containment, never raw substring:
    // the bank key "Gender" matched inside "Do you identify as transGENDER?"
    // and answered "Male" to the wrong question.
    const phraseIn = (needle: string, hayS: string) => {
      const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)', 'i').test(hayS);
    };
    for (const [q, a] of Object.entries(answers || {})) {
      const nq = q.toLowerCase().trim();
      if (nq.length >= 5 && (phraseIn(nq, lbl) || phraseIn(lbl, nq))) return has(a);
    }
    const stop = new Set(['what', 'your', 'you', 'are', 'the', 'this', 'that', 'for', 'with', 'have', 'does', 'will', 'would', 'como', 'essa', 'esta', 'para', 'que', 'las', 'los', 'una', 'del', 'voc', 'plea', 'please']);
    const toks = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9áéíóúüñãõç]+/i).filter((w) => w.length >= 4 && !stop.has(w)));
    const lt = toks(lbl);
    let best: { a: string; score: number } | null = null;
    for (const [q, a] of Object.entries(answers || {})) {
      const qt = toks(q);
      let common = 0;
      for (const w of lt) if (qt.has(w)) common++;
      if (common >= 2 && (!best || common > best.score)) best = { a, score: common };
    }
    if (best) return has(best.a);
  }
  // AFTER the bank (explicit answers always win): voluntary demographic /
  // self-identification questions default to "decline to answer" on every ATS.
  if (DEMOGRAPHIC_RX.test(hay)) return DECLINE_ANSWER;
  return undefined;
}
