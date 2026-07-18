// Applica autofill content script. Runs inside the real ATS application page (the
// user's own browser session), so there is no automation to detect and no separate
// browser process: it just reads every field and fills what it recognizes from the
// user's Applica profile + answer bank. Captcha and any field we don't know stay
// for the user - by design.
(() => {
  if (window.__applicaLoaded) return;
  window.__applicaLoaded = true;

  // ---- utilities ---------------------------------------------------------------
  // Recurse into open shadow roots (SmartRecruiters/SAP render inputs there).
  function deepAll(selector, root = document, acc = []) {
    root.querySelectorAll(selector).forEach((el) => acc.push(el));
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) deepAll(selector, el.shadowRoot, acc); });
    return acc;
  }

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function labelFor(el) {
    // Many ATS (SmartRecruiters/SAP "spl-*" web components) render the real <input>
    // inside a shadow root with no name and no in-shadow label - the visible label
    // ("First name*") lives in the OUTER document, around the component host. So we
    // climb out through each shadow boundary (input -> shadow root -> host -> ...)
    // looking for a label at every level.
    let t = '';
    let node = el;
    for (let hop = 0; hop < 4 && !t && node; hop++) {
      const root = node.getRootNode ? node.getRootNode() : document;
      if (node.id && root.querySelector) { const l = root.querySelector(`label[for="${CSS.escape(node.id)}"]`); if (l) t = l.innerText; }
      if (!t && node.closest) { const w = node.closest('label'); if (w) t = w.innerText; }
      if (!t && node.getAttribute) t = node.getAttribute('aria-label') || node.getAttribute('label') || '';
      if (!t && node.getAttribute) { const lb = node.getAttribute('aria-labelledby'); if (lb && root.getElementById) t = lb.split(' ').map((id) => root.getElementById(id)?.innerText || '').join(' '); }
      if (!t && node.closest) { const g = node.closest('[class*="field" i],[class*="question" i],[class*="form-group" i],[class*="form-section" i]'); if (g) { const l = g.querySelector('label,legend'); if (l) t = l.innerText; } }
      if (!t && node.placeholder) t = node.placeholder;
      // SR "Preliminary questions": question text is a preceding sibling, no real
      // <label> (labels hold just "*"). Walk previous siblings/ancestors for the
      // nearest meaningful text line.
      if (!t || t.trim() === '*') {
        let anc = node;
        for (let up = 0; up < 4 && (!t || t.trim() === '*') && anc; up++) {
          let sib = anc.previousElementSibling;
          while (sib && (!t || t.trim() === '*')) {
            const s = (sib.innerText || '').replace(/\s+/g, ' ').trim();
            if (s && s.length >= 3 && s.length <= 160 && s !== '*') t = s;
            sib = sib.previousElementSibling;
          }
          anc = anc.parentElement;
        }
      }
      if (t && t.trim() === '*') t = '';
      node = root && root.host ? root.host : null; // jump to the shadow host and retry in the outer tree
    }
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  // Voluntary demographic / self-identification questions: without an explicit
  // bank answer, default to the "decline to answer" option (same rule as the
  // worker's universalFill). If the user changes it by hand, capture learns theirs.
  const DECLINE_ANSWER = '__applica_decline__';
  const DECLINE_OPTION_RX = /decline to (self[- ]?identify|answer|state|disclose)|prefer not to|do ?n[o']?t wish to (answer|self)|don'?t want to answer|i do not (wish|want) to answer|rather not say|prefiero no|no deseo (responder|contestar|decir)|prefiro n[aã]o (responder|informar|declarar)|n[aã]o desejo (responder|informar)/i;
  // pt-BR terms (LGBTQIAPN+, "pessoa com deficiência", "pretas e pardas"...)
  // kept in lockstep with universalFill.ts's DEMOGRAPHIC_RX - a real Brazilian
  // Greenhouse posting's diversity checkboxes rendered in Portuguese and went
  // unrecognized, blocking the application instead of auto-declining like
  // every other ATS's demographic block.
  const DEMOGRAPHIC_RX = /gender identity|\bgender\b|transgender|sexual orientation|pronouns?|racial|ethnic|\brace\b|hispanic|latino|veteran|disabilit|self[- ]identif|demographic|lgbtqia?p?n?\+?|defici[eê]nc|pretas? e pardas?|pessoas? negras?|ra[cç]a\b|identidade de g[eê]nero|orienta[cç][aã]o sexual|autodeclara[cç][aã]o/i;

  function resolveKnown(label, name, data) {
    const hay = `${label} ${name}`.toLowerCase();
    const p = data.profile || {};
    const has = (v) => (v != null && String(v).trim() ? String(v).trim() : undefined);
    if (/mail|correo/.test(hay)) return has(p.email);
    if (/linked-?in/.test(hay)) return has(p.linkedin);
    if (/github/.test(hay)) return has(p.github);
    if (/website|portfolio|portafolio|personal (site|web)/.test(hay)) { const pf = has(p.portfolio) || has(p.linkedin); return pf ? pf.split(/[,;\s]+/)[0] : undefined; } // one URL only; SR rejects commas
    if (/phone|tel[eé]|mobile|m[oó]vil|celular|whatsapp/.test(hay)) return has(p.phone);
    if (/first ?name|given ?name|primer nombre|forename/.test(hay)) return has(p.firstName) || (p.fullName ? p.fullName.split(' ')[0] : undefined);
    if (/last ?name|surname|family ?name|apellido/.test(hay)) return has(p.lastName) || (p.fullName ? p.fullName.split(' ').slice(1).join(' ') : undefined);
    if (/full name|nombre completo|your name|legal name/.test(hay)) return has(p.fullName);
    if (/country|pa[ií]s/.test(hay)) return has(p.country);
    if (/city|ciudad|town/.test(hay)) return has(p.city);
    if (/location|ubicaci|where.*(are|located|based)|residen|domicil/.test(hay)) return has(p.city) || has(p.country);
    if (/\bname\b|nombre/.test(hay)) return has(p.fullName);
    // Concept rules: same question, different wording/language across ATSes.
    if (/desired salary|salary expectation|expectativa salarial|pretensi[oó]n salarial|expected (compensation|salary)|remuneraci[oó]n (deseada|esperada)/.test(hay)) {
      for (const [q, a] of Object.entries(data.answers || {})) if (/salar|compensation|remunera/i.test(q)) return has(a);
      return undefined;
    }
    if (/how did you (hear|find|learn)|hear about (us|this)|encontrou (essa|esta) vaga|c[oó]mo (te enteraste|conociste|encontraste)|source of (application|referral)|where did you (hear|find)/.test(hay)) {
      for (const [q, a] of Object.entries(data.answers || {})) if (/hear about|how did you|encontrou|enteraste|source/i.test(q)) return has(a);
      return 'LinkedIn';
    }
    const lbl = label.toLowerCase().trim();
    if (lbl.length >= 5) {
      // WHOLE-WORD phrase containment, never raw substring: the bank key
      // "Gender" matched inside "Do you identify as transGENDER?" and answered
      // "Male" to the wrong question.
      for (const [q, a] of Object.entries(data.answers || {})) {
        const nq = q.toLowerCase().trim();
        if (nq.length < 5) continue;
        const inL = new RegExp('(^|[^a-z0-9])' + escapeRe(nq) + '([^a-z0-9]|$)', 'i').test(lbl);
        const inQ = new RegExp('(^|[^a-z0-9])' + escapeRe(lbl) + '([^a-z0-9]|$)', 'i').test(nq);
        if (inL || inQ) return has(a);
      }
      // Keyword-overlap fallback (>=2 significant shared words).
      const stop = ['what', 'your', 'you', 'are', 'the', 'this', 'that', 'for', 'with', 'have', 'does', 'will', 'would', 'como', 'essa', 'esta', 'para', 'que', 'las', 'los', 'una', 'del', 'please'];
      const lt = lbl.split(/[^a-z0-9áéíóúüñãõç]+/i).filter((w) => w.length >= 4 && !stop.includes(w));
      let best = null;
      for (const [q, a] of Object.entries(data.answers || {})) {
        const qt = q.toLowerCase().split(/[^a-z0-9áéíóúüñãõç]+/i).filter((w) => w.length >= 4 && !stop.includes(w));
        let common = 0;
        for (const w of lt) if (qt.includes(w)) common++;
        if (common >= 2 && (!best || common > best.score)) best = { a, score: common };
      }
      if (best) return has(best.a);
    }
    // AFTER the bank (explicit answers win): voluntary demographics default to
    // the "decline to answer" option.
    if (DEMOGRAPHIC_RX.test(hay)) return DECLINE_ANSWER;
    return undefined;
  }

  const isVisible = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null; };
  const isTypeahead = (el) => el.getAttribute('role') === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' || el.getAttribute('aria-haspopup') || el.closest('[class*="select__" i],[class*="react-select" i],[class*="typeahead" i],[class*="autocomplete" i]');

  async function fillTypeahead(el, value) {
    // Live-search autocompletes (SR city) need real keystrokes to fire their async
    // search, then a click on a suggestion. Type char by char accumulating in `acc`
    // (reading el.value back is unreliable - the widget can reset it, which dropped
    // the first letter before). Give focus a beat so the first keystroke isn't lost.
    // Cap what we type: a typeahead only needs the first few words to surface the
    // right option. Some bank answers are long paragraphs (demographics) - typing
    // those char by char is slow and pointless; the first ~24 chars trigger the
    // search and the option match keys off the first word anyway.
    // "Decline to answer" default: open the menu WITHOUT typing (the full option
    // list shows) and click the decline row directly.
    if (value === DECLINE_ANSWER) {
      el.focus();
      realClick(el);
      await sleep(900);
      const declRows = deepAll('[role="option"], li, spl-select-option, [class*="option" i]')
        .filter(isVisible)
        .filter((o) => !(o.tagName === 'A' || (o.closest && o.closest('a[href]'))))
        .filter((o) => { const t = (o.innerText || '').trim(); return t && t.length < 70 && !t.includes('\n') && DECLINE_OPTION_RX.test(t); });
      if (declRows[0]) { realClick(declRows[0]); return true; }
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return false;
    }
    // Up to the first comma only: "City, Province, Country" confuses remote
    // geocoders into wrong-region suggestions; "City" alone nails it.
    const trimmed = value.split(',')[0].trim();
    const query = trimmed.length > 24 ? trimmed.slice(0, 24) : trimmed;
    el.focus();
    await sleep(110);
    setNativeValue(el, '');
    await sleep(40);
    let acc = '';
    for (const ch of query) {
      acc += ch;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
      setNativeValue(el, acc);
      el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));
      await sleep(22);
    }
    await sleep(1100);
    const first = value.split(/[\s,|]/)[0];
    // Keep only leaf rows: a single option line, not the list container (whose
    // innerText concatenates every option - clicking it selects nothing).
    const leaves = deepAll('[role="option"], li, spl-select-option, [class*="select-option" i], [class*="option" i], [class*="result" i], [class*="suggestion" i]')
      .filter(isVisible)
      .filter((o) => !(o.tagName === 'A' || (o.closest && o.closest('a[href]')))) // never click links (could navigate away, e.g. cookie policy)
      .filter((o) => { const t = (o.innerText || '').trim(); return t.length > 1 && t.length < 70 && !t.includes('\n') && !/cannot find|fill in manually|no se encontr/i.test(t); });
    // Exact-then-word-boundary match, never substring: "Male" must not select
    // "Female | Feminino" ('male' is a substring of 'Female').
    const match = leaves.find((o) => new RegExp('^\\s*' + escapeRe(first) + '\\s*([|(].*)?$', 'i').test((o.innerText || '').trim()))
      || leaves.find((o) => new RegExp('\\b' + escapeRe(first) + '\\b', 'i').test(o.innerText))
      || leaves[0];
    if (match) { realClick(match); return true; }
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Web-component dropdown rows (SR's <spl-select-option>) select on the full mouse
  // sequence, not a bare .click() - dispatch the whole gesture so it registers.
  function realClick(el) {
    // composed:true lets the event cross shadow-DOM boundaries to reach the
    // component's listener (SR options live in a shadow root); without it the
    // gesture never propagates and the option stays unselected.
    const o = { bubbles: true, cancelable: true, composed: true, view: window };
    try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mousedown', o));
    try { el.dispatchEvent(new PointerEvent('pointerup', o)); } catch (_) {}
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.dispatchEvent(new MouseEvent('click', o));
  }

  // ---- fill flow ---------------------------------------------------------------
  async function fillForm(data, onProgress) {
    let count = 0;
    const bump = () => { count++; if (onProgress) onProgress(count); };
    const fields = deepAll('input, select, textarea').filter((el) => {
      const type = (el.type || '').toLowerCase();
      if (['hidden', 'file', 'submit', 'button', 'reset', 'image', 'password', 'checkbox', 'radio'].includes(type)) return false;
      // One shot per field: if we filled it once and the user then cleared/edited it
      // (e.g. the ATS rejected our value's format), never refill it - that would
      // fight the user in a loop and block them from advancing.
      if (el.getAttribute('data-applica-filled')) return false;
      return isVisible(el) && !el.disabled && !el.readOnly;
    });
    // Fill fast text/select fields FIRST (instant), typeaheads LAST (each waits on an
    // async search). This fills the visible form immediately and defers the slow bits,
    // so the user sees progress right away instead of staring at an empty form.
    const slow = [];
    for (const el of fields) {
      if (el.value && el.tagName.toLowerCase() !== 'select') continue; // don't clobber existing
      const label = labelFor(el);
      const val = resolveKnown(label, el.getAttribute('name') || '', data);
      if (!val) continue;
      try {
        if (el.tagName.toLowerCase() === 'select') {
          const opt = val === DECLINE_ANSWER
            ? Array.from(el.options).find((o) => DECLINE_OPTION_RX.test(o.text))
            : (Array.from(el.options).find((o) => new RegExp(`^${escapeRe(val)}$`, 'i').test(o.text) || o.value.toLowerCase() === val.toLowerCase())
              || Array.from(el.options).find((o) => new RegExp(escapeRe(val), 'i').test(o.text)));
          if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })); el.setAttribute('data-applica-filled', '1'); bump(); }
        } else if (isTypeahead(el)) {
          slow.push({ el, val });
        } else if (val !== DECLINE_ANSWER) { // free-text demographic stays empty (voluntary)
          setNativeValue(el, val);
          el.setAttribute('data-applica-filled', '1');
          bump();
        }
      } catch (_) { /* keep going */ }
    }
    count += fillChoiceGroups(data);
    if (onProgress) onProgress(count);
    for (const { el, val } of slow) {
      try { if (await fillTypeahead(el, val)) { el.setAttribute('data-applica-filled', '1'); bump(); } } catch (_) { /* keep going */ }
    }
    return count;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Attach the CV automatically. Extensions can't set input.value of a file input,
  // but they CAN assign input.files from a DataTransfer built from a real File - so
  // we fetch the CV bytes from Applica, build a File, and drop it on the document
  // file input (skipping any image/avatar input). Dispatched with composed events so
  // shadow-DOM upload widgets register it.
  async function attachResume(data) {
    if (!data.resume) return false;
    try {
      // Fetch the CV via the background service worker: a content script on an HTTPS
      // ATS page can't fetch http://localhost (mixed content), and cross-origin CORS
      // is simpler from the extension context. Background returns base64 bytes.
      const r = await chrome.runtime.sendMessage({ type: 'GET_RESUME', path: data.resume.url });
      if (!r || !r.b64) return false;
      const bin = atob(r.b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], r.filename || data.resume.filename || 'cv.pdf', { type: 'application/pdf' });
      const inputs = deepAll('input[type="file"]');
      const target = inputs.find((i) => /pdf|doc|rtf|resume|\.txt/i.test(i.getAttribute('accept') || ''))
        || inputs.find((i) => !/image/i.test(i.getAttribute('accept') || ''))
        || inputs[0];
      if (!target) return false;
      const dt = new DataTransfer();
      dt.items.add(file);
      target.files = dt.files;
      target.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      target.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
      await sleep(1600);
      return true;
    } catch (_) { return false; }
  }

  function fillChoiceGroups(data) {
    let n = 0;
    const radios = deepAll('input[type="radio"], input[type="checkbox"]').filter(isVisible);
    const groups = {};
    for (const r of radios) { const key = r.name || labelFor(r); (groups[key] = groups[key] || []).push(r); }
    for (const [, els] of Object.entries(groups)) {
      const q = groupQuestion(els[0]);
      if (!q) continue;
      let answer;
      for (const [bq, ba] of Object.entries(data.answers || {})) {
        if (bq.toLowerCase().trim() === q.toLowerCase().trim() || q.toLowerCase().includes(bq.toLowerCase())) { answer = ba; break; }
      }
      if (!answer) continue;
      const opt = els.find((e) => new RegExp(escapeRe(answer), 'i').test(labelFor(e))) || els.find((e) => new RegExp(escapeRe(answer), 'i').test(e.value));
      if (opt && !opt.checked) { opt.click(); n++; }
    }
    return n;
  }

  function groupQuestion(el) {
    const g = el.closest('fieldset, [role="radiogroup"], [class*="question" i], [class*="field" i]');
    if (g) { const l = g.querySelector('legend, label, [class*="label" i]'); if (l) return l.innerText.replace(/\s+/g, ' ').trim(); }
    return el.getAttribute('aria-label') || '';
  }

  // ---- UI: real-time status banner (top bar) -----------------------------------
  function banner(html, kind) {
    let b = document.getElementById('applica-banner');
    if (!b) { b = document.createElement('div'); b.id = 'applica-banner'; document.documentElement.appendChild(b); }
    b.className = `applica-banner applica-b-${kind}`;
    b.innerHTML = html;
  }

  // Is a VISIBLE human-verification challenge present? We deliberately ignore the
  // passive invisible reCAPTCHA badge (present on many Greenhouse forms but rarely
  // challenges) so we don't cry wolf - only an actual on-screen challenge counts.
  function hasCaptcha() {
    const frames = deepAll('iframe[title*="challenge" i], iframe[title*="expires" i], iframe[src*="hcaptcha"], iframe[src*="funcaptcha"], iframe[src*="arkose"], iframe[src*="bframe"]');
    for (const f of frames) { const r = f.getBoundingClientRect(); if (r.width > 60 && r.height > 60) return true; }
    const txt = (document.body?.innerText || '').toLowerCase();
    return /no a un robot|nos aseguramos de que|verify (you are|you're) human|i'?m not a robot|desliza|slide to|press ?& ?hold|reto de seguridad|security check|completa(r)? el patr[oó]n|complete the (pattern|puzzle)|arrastra|drag (the|each|to)|security code|verification code|c[oó]digo de (seguridad|verificaci[oó]n)|enter (the|your) code|sent (you )?a (security |verification )?code|one[- ]?time (code|password|passcode)|introduce (el|tu) c[oó]digo|hemos enviado un c[oó]digo|check your (e-?mail|inbox) for/i.test(txt);
  }

  // Count still-empty required fields, so we can say "complete N campos" honestly.
  function countMissingRequired() {
    const fields = deepAll('input, select, textarea').filter((el) => {
      const ty = (el.type || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'file'].includes(ty)) return false;
      if (!isVisible(el) || el.disabled) return false;
      const req = el.required || el.getAttribute('aria-required') === 'true' || /[*✱]/.test(labelFor(el));
      return req && !((el.value || '').trim());
    });
    return fields.length;
  }

  // Rotating sub-messages during filling so the wait feels alive, not frozen.
  const FILLING_MSGS = [
    'Leyendo la vacante...',
    'Eligiendo la mejor respuesta para cada pregunta...',
    'Mejorando tu perfil para este puesto...',
    'Adaptando tus datos al formulario...',
    'Verificando que todo cuadre con tu CV...',
    'Completando los campos que reconoce...',
  ];

  async function run() {
    let fillingTick = 0;
    let lastCount = 0;
    const paintFilling = () => {
      const phrase = FILLING_MSGS[Math.floor(fillingTick / 2) % FILLING_MSGS.length];
      fillingTick++;
      banner(`<span class="applica-dot"></span> <b>Applica est&aacute; llenando tu postulaci&oacute;n:</b> ${phrase}${lastCount ? ` (${lastCount} campo(s) listos)` : ''} <i>Por favor, no toques nada mientras trabajamos.</i>`, 'filling');
    };
    paintFilling();
    const ticker = setInterval(paintFilling, 1300);
    const data = await chrome.runtime.sendMessage({ type: 'GET_MATERIALS', url: location.href });
    if (!data || data.error) {
      clearInterval(ticker);
      if (data?.error === 'no_token' || data?.error === 'invalid_token') banner('Conecta Applica: abre <b>Applica</b> en otra pesta&ntilde;a para enlazar la extensi&oacute;n.', 'warn');
      else banner('Applica no pudo cargar tus datos (' + (data?.error || 'error') + ').', 'warn');
      return;
    }
    // CV first (critical + some ATS autofill from it); then the fields. Each isolated
    // so one failing never skips the other.
    let cvOk = false;
    try { cvOk = await attachResume(data); } catch (e) { console.warn('[Applica] cv error', e); }
    let filled = 0;
    const onProgress = (n) => { lastCount = n; };
    try { filled = await fillForm(data, onProgress); } catch (e) { console.warn('[Applica] fill error', e); }
    clearInterval(ticker);

    // Final real-time state: captcha > missing fields > ready.
    const cvBtnHtml = (data.resume && !cvOk) ? ' <button id="applica-cv" class="applica-cvbtn">Adjuntar CV</button>' : '';
    if (hasCaptcha()) {
      banner(`<b>Tu turno.</b> Completa la verificaci&oacute;n (captcha o c&oacute;digo de tu correo); Applica ya llen&oacute; todo lo dem&aacute;s.${cvBtnHtml}`, 'action');
    } else {
      const miss = countMissingRequired();
      if (miss > 0 || (data.resume && !cvOk)) {
        const parts = [];
        if (miss > 0) parts.push(`completa ${miss} campo(s) marcado(s)`);
        if (data.resume && !cvOk) parts.push('adjunta tu CV');
        banner(`<b>Casi listo.</b> Solo falta: ${parts.join(' y ')}, y pulsa Enviar.${cvBtnHtml}`, 'action');
      } else {
        banner('<b>Listo.</b> Revisa que todo est&eacute; bien y pulsa Enviar. Applica ya no toca nada.', 'ready');
      }
    }
    const cvBtn = document.getElementById('applica-cv');
    if (cvBtn && data.resume) cvBtn.onclick = () => chrome.runtime.sendMessage({ type: 'DOWNLOAD_RESUME', path: data.resume.url });
  }

  function mountButton() {
    if (document.getElementById('applica-fab')) return;
    const b = document.createElement('button');
    b.id = 'applica-fab';
    b.textContent = 'Llenar con Applica';
    b.onclick = run;
    document.body.appendChild(b);
  }

  if (document.body) mountButton();
  else window.addEventListener('DOMContentLoaded', mountButton);
})();
