import { chromium } from 'playwright-extra';
import { Browser, BrowserContext } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

let globalBrowser: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  // Found real 2026-07-23 while adding real-browser web-search discovery:
  // Bing's page can crash the shared Chromium process mid-navigation, and
  // this cache had no liveness check - every call after that kept handing
  // back a dead `Browser` reference, so `browser.newContext()` failed with
  // "Target page, context or browser has been closed" for the rest of the
  // worker's life (any automation, not just discovery) until a full process
  // restart. Detect the dead reference and relaunch instead of trusting it.
  if (globalBrowser && !globalBrowser.isConnected()) {
    console.warn('[BrowserManager] Cached browser is disconnected, relaunching...');
    globalBrowser = null;
  }
  if (globalBrowser) return globalBrowser;

  // Default headless (original behavior). Headful passes invisible reCAPTCHA more
  // reliably, so it's available as an opt-in via APPLY_HEADFUL=true.
  const headless = process.env.APPLY_HEADFUL !== 'true';
  console.log(`[BrowserManager] Launching new Chromium instance (headless=${headless})...`);
  globalBrowser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-dev-shm-usage',
    ],
  });

  return globalBrowser;
}

/**
 * Injected into every page. hCaptcha (used by e.g. Lever/dLocal) requests a WebGL
 * context with failIfMajorPerformanceCaveat:true; on hosts without a real GPU
 * Chromium refuses it with a FATAL error that crashes the whole tab. Forcing that
 * flag to false lets the software WebGL context be created instead of crashing -
 * hCaptcha still works. Passed as a string to avoid tsx/esbuild __name injection.
 */
const WEBGL_CAVEAT_PATCH = `
(() => {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      return null; // hCaptcha falls back to its non-WebGL path; the visible image
                   // challenge is DOM-based, so the user can still solve it.
    }
    return orig.apply(this, arguments);
  };
})();`;

export interface ContextOptions {
  proxy?: {
    server: string;
    username?: string;
    password?: string;
  };
  // X11 display to launch INTO, e.g. ':100' - only meaningful for the headful
  // path (launchHeadfulBrowser). Lets several assisted-apply sessions run at
  // once, each on its own virtual screen (see docs/APPLY-ENGINE.md and the
  // live-session/noVNC plan) instead of all fighting over the single
  // process-wide DISPLAY env var PM2 sets. Falls back to that inherited env
  // var when omitted, so existing single-session behavior is unchanged.
  display?: string;
}

/**
 * Residential/rotating proxy from env (so applies use a residential IP instead of
 * a datacenter one, reducing detection). Set PROXY_SERVER (e.g.
 * "http://host:port" or "socks5://host:port") and optionally PROXY_USERNAME /
 * PROXY_PASSWORD. Returns undefined when not configured.
 */
export function getProxyFromEnv(): ContextOptions['proxy'] | undefined {
  const server = process.env.PROXY_SERVER;
  if (!server) return undefined;
  return {
    server,
    username: process.env.PROXY_USERNAME || undefined,
    password: process.env.PROXY_PASSWORD || undefined,
  };
}

export async function createIncognitoContext(options?: ContextOptions): Promise<BrowserContext> {
  const browser = await getBrowser();
  // Default to the env proxy unless a specific one was passed.
  const proxy = options?.proxy ?? getProxyFromEnv();

  // A pool of user agents to rotate, adding more stealth
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  ];
  const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];

  const ctx = await browser.newContext({
    userAgent: randomUA,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    proxy,
  });
  await ctx.addInitScript(WEBGL_CAVEAT_PATCH);
  return ctx;
}

/**
 * Launch a SEPARATE, always-visible (headful) browser on the user's machine for
 * assisted apply: we open the offer, pre-fill the form, and hand the window to the
 * user to finish (CAPTCHA + submit). Independent of the shared background browser
 * so it can stay open without affecting the worker's headless scraping.
 */
// Must match the pool's Xvfb resolution (xvfb-pool@.service on the VPS,
// `Xvfb :10%i -screen 0 500x900x24` - not tracked in this repo). `Xvfb`/the
// assisted-apply pool run with NO window manager at all, so `--start-maximized`
// has nothing to negotiate window geometry with and silently falls back to
// some default size far smaller than the virtual screen - found real via the
// user's noVNC screenshot showing the browser filling only a small fraction
// of the phone-shaped display with a huge black margin below it. An explicit
// `--window-size`/`--window-position` doesn't need a WM at all.
// Width is 500, not phone-narrow 420: verified live with `xwininfo` that
// Chromium enforces its own ~500px minimum window width regardless of
// `--window-size` - requesting 420 still produced a 500-wide window, wider
// than a 420 Xvfb screen, clipping the right edge. Matching Xvfb to
// Chromium's real floor avoids that mismatch entirely.
const HEADFUL_SCREEN_SIZE = { width: 500, height: 900 };

export async function launchHeadfulBrowser(options?: ContextOptions): Promise<{ browser: Browser; context: BrowserContext }> {
  const proxy = options?.proxy ?? getProxyFromEnv();
  console.log(`[BrowserManager] Launching headful browser for assisted apply${options?.display ? ` on display ${options.display}` : ''}...`);
  const browser = await chromium.launch({
    headless: false,
    // Without an explicit `display`, Chromium inherits DISPLAY from
    // process.env (the single Xvfb :99 that ecosystem.config.js sets) - fine
    // for one session at a time. With one, each concurrent assisted-apply
    // session renders into its OWN virtual screen from the pool.
    env: options?.display ? { ...process.env, DISPLAY: options.display } : undefined,
    args: [
      '--disable-blink-features=AutomationControlled',
      `--window-size=${HEADFUL_SCREEN_SIZE.width},${HEADFUL_SCREEN_SIZE.height}`,
      '--window-position=0,0',
      // Headful uses the user's REAL GPU (don't force software GL - that's what
      // crashes on hCaptcha/WebGL pages like Lever/dLocal in GPU-less environments).
      '--disable-dev-shm-usage',
    ],
  });
  const context = await browser.newContext({
    viewport: null, // use the real window size
    locale: 'en-US',
    proxy,
  });
  await context.addInitScript(WEBGL_CAVEAT_PATCH);
  await context.addInitScript(APPLICA_BANNER);
  return { browser, context };
}

/**
 * Launch the user's REAL browser (Brave/Chrome/Edge binary) with a dedicated,
 * persistent profile - headful, with the automation flag hidden. A real browser
 * binary + real GPU + non-headless + persistent profile earns a high reCAPTCHA v3
 * trust score, so invisible captchas often pass WITHOUT a challenge true auto
 * submit. (This does NOT solve captchas; it presents a genuinely trustworthy
 * browser so score-based checks don't fire.) Returns null if no local browser.
 */
/**
 * Injected into the real-browser apply pages. On submit / before the page unloads,
 * it serializes the form's question->answer pairs into sessionStorage so we can read
 * exactly what the user ended up submitting (silent learning), without racing the
 * navigation. Passed as a string to avoid tsx/esbuild __name injection.
 */
const WINDOW_CAPTURE = `
(() => {
  // Walk into open shadow roots too - SmartRecruiters (SAP "spl-*" components)
  // renders every field inside shadow DOM, invisible to a plain querySelectorAll.
  // That's why typed answers (e.g. "Bloomberg" as a certification institution)
  // never made it into the reusable-answer bank: this capture saw nothing there.
  function deepAll(sel, root, acc){
    root.querySelectorAll(sel).forEach(function(e){ acc.push(e); });
    root.querySelectorAll('*').forEach(function(e){ if (e.shadowRoot) deepAll(sel, e.shadowRoot, acc); });
    return acc;
  }
  // The visible label can live in the OUTER light DOM while the input sits inside
  // the component's shadow root - climb out through each shadow boundary looking
  // for it, same trick used by the browser extension and universalFill.ts.
  function labelOf(start){
    var node = start, label = '';
    for (var hop = 0; hop < 4 && !label && node; hop++) {
      var root = node.getRootNode ? node.getRootNode() : document;
      if (node.id && root.querySelector) { var l = root.querySelector('label[for="'+node.id.replace(/"/g,'')+'"]'); if (l) label = l.innerText; }
      if (!label && node.closest) { var w = node.closest('label'); if (w) label = w.innerText; }
      if (!label && node.getAttribute) label = node.getAttribute('aria-label') || '';
      if (!label && node.closest) { var grp = node.closest('[class*="field" i], [class*="question" i], fieldset, li'); if (grp) { var lg = grp.querySelector('label, legend, [class*="label" i], .text'); if (lg) label = lg.innerText; } }
      if (!label && node.placeholder) label = node.placeholder;
      // SR "Preliminary questions": the question text is a PRECEDING sibling, no
      // real <label> (labels there hold just "*"). Walk previous siblings/ancestors
      // for the nearest meaningful line so learning stores the real question.
      if (!label || label.replace(/\s+/g,'') === '*') {
        var anc = node;
        for (var up = 0; up < 4 && (!label || label.replace(/\s+/g,'') === '*') && anc; up++) {
          var sib = anc.previousElementSibling;
          while (sib && (!label || label.replace(/\s+/g,'') === '*')) {
            var t = (sib.innerText || '').replace(/\s+/g,' ').trim();
            if (t && t.length >= 3 && t.length <= 160 && t !== '*') label = t;
            sib = sib.previousElementSibling;
          }
          anc = anc.parentElement;
        }
      }
      if (label && label.replace(/\s+/g,'') === '*') label = '';
      node = root && root.host ? root.host : null;
    }
    return label;
  }
  function snap(){
    try {
      var out = {}, seen = {};
      var els = deepAll('input,select,textarea', document, []);
      for (var k=0;k<els.length;k++){
        var i = els[k];
        if (['hidden','file','submit','button','password'].indexOf(i.type)>=0) continue;
        function ownLabel(el){ var t=''; if(el.id){ var lf=document.querySelector('label[for="'+el.id.replace(/"/g,'')+'"]'); if(lf) t=lf.innerText||''; } if(!t){ var cl=el.closest('label'); if(cl) t=cl.innerText||''; } return t; }
        if(i.type==='radio'||i.type==='checkbox'){
          if(seen[i.name]) continue; seen[i.name]=1;
          // KEY = the group's QUESTION label (container), not the option's own label.
          var qc = i.closest('[class*="field" i], [class*="question" i], fieldset');
          var qlabel = (qc && qc.querySelector('legend, [class*="label" i], .text')) ? qc.querySelector('legend, [class*="label" i], .text').innerText : '';
          qlabel=(qlabel||i.getAttribute('aria-label')||'').replace(/\\s+/g,' ').replace(/[✱*]/g,'').trim();
          if(!qlabel || qlabel.length>160) continue;
          var grp=document.querySelectorAll('input[name="'+i.name.replace(/"/g,'')+'"]');
          var picks=[]; for(var j=0;j<grp.length;j++){ if(grp[j].checked){ var ol=ownLabel(grp[j]); ol=(ol||grp[j].value||'').replace(/\\s+/g,' ').trim(); if(ol && ol.toLowerCase()!=='on') picks.push(ol); else if(grp.length===1) picks.push('Yes'); } }
          if(picks.length) out[qlabel]=picks.join(', ');
        } else {
          var label = labelOf(i);
          label=(label||i.getAttribute('aria-label')||i.placeholder||'').replace(/\\s+/g,' ').replace(/[✱*]/g,'').trim();
          if(!label || label.length>160) continue;
          var v=(i.value||'').trim();
          // Committed combobox picks (react-select) live in a SIBLING single/multi
          // value div while the input stays empty - walk parents or list answers
          // the user picked are never captured for learning.
          if(!v){ var anc=i.parentElement; for(var up=0; up<4 && anc && !v; up++){ var sv=anc.querySelector && anc.querySelector('[class*="single-value" i], [class*="multi-value" i]'); if(sv) v=(sv.textContent||'').replace(/\\s+/g,' ').trim(); anc=anc.parentElement; } }
          if(v) out[label]=v;
        }
      }
      sessionStorage.setItem('__applica_cap', JSON.stringify(out));
    } catch(e){}
  }
  window.addEventListener('submit', snap, true);
  window.addEventListener('beforeunload', snap);
  document.addEventListener('click', function(e){ var t=e.target; if(t && (t.type==='submit' || /submit|enviar|apply|aplicar/i.test((t.textContent||'').slice(0,40)))) setTimeout(snap,60); }, true);
})();`;

/**
 * A friendly top bar injected into the application window so the user knows what's
 * happening: while Applica fills, "espera, no toques"; once done, "resuelve el
 * captcha y envia". Passed as a string to avoid tsx/esbuild __name injection.
 * Update the phase from Node with: page.evaluate(() => window.__applicaSetPhase('ready')).
 */
const APPLICA_BANNER = `
(() => {
  // TOP frame only: addInitScript runs in EVERY frame, and the banner was also
  // rendering INSIDE the hCaptcha challenge iframe (its own fixed top bar, stuck
  // in 'filling' phase), covering the challenge question the user must read.
  try { if (window.top !== window.self) return; } catch (e) { return; }
  if (window.__applicaBannerInit) return; window.__applicaBannerInit = true;
  // addInitScript runs as early as Page.addScriptToEvaluateOnNewDocument allows -
  // sometimes before document.documentElement exists yet, which crashed the very
  // first appendChild() with "Cannot read properties of null" and silently killed
  // the whole banner (init flag was set, so it never retried). Poll until the DOM
  // actually has a root element before touching it.
  // Stub so an early Node-side call (window.__applicaSetPhase('ready')) before the
  // DOM exists is remembered, not lost - setup() below replaces this with the real
  // renderer and immediately applies whatever phase was queued.
  window.__applica_phase = window.__applica_phase || 'filling';
  window.__applicaSetPhase = window.__applicaSetPhase || function(p){ window.__applica_phase = p; };
  function whenReady(fn){
    if (document.documentElement) { fn(); return; }
    setTimeout(function(){ whenReady(fn); }, 15);
  }
  // Do NOT touch the DOM until the page finished loading (+1s buffer): injecting
  // the bar/<style> BEFORE React hydrates makes hydration FAIL (minified errors
  // #418/#423 seen on Greenhouse job-boards), and React "recovers" by re-rendering
  // the whole app from scratch - which WIPES everything the adapter already
  // filled (committed selections included) and forces slow, error-prone refills.
  var settledWait = 0;
  function whenSettled(fn){
    if (document.readyState === 'complete' || settledWait > 8000) { setTimeout(fn, 1000); return; }
    settledWait += 200;
    setTimeout(function(){ whenSettled(fn); }, 200);
  }
  whenReady(function(){ whenSettled(setup); });
  function setup(){
  // Re-run on EVERY ensure() tick, not once: React SPAs (Greenhouse job-boards)
  // wipe injected nodes on hydration/re-render. The bar was re-added by ensure()
  // but the <style> was not, leaving an UNSTYLED bar (position:static) parked at
  // the bottom of the page - i.e. an invisible banner.
  function ensureStyle(){
  if (!document.getElementById('__applica_style')) {
    var st = document.createElement('style'); st.id = '__applica_style';
    // Real styling lives HERE (in a <style> block, referenced by class) rather than
    // as inline style="" attributes on the injected elements - some ATS enforce a
    // strict CSP (style-src-attr) that silently drops inline style attributes,
    // which left the bar invisible/unstyled on those sites even though it existed.
    st.textContent = '@keyframes __aspin{to{transform:rotate(360deg)}}'
      + '@keyframes __apulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.6)}}'
      + '#__applica_bar{position:fixed!important;top:0;left:0;right:0;z-index:2147483647;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}'
      + '.__a-row{color:#fff;padding:11px 20px;display:flex;align-items:center;gap:13px;box-shadow:0 3px 16px rgba(0,0,0,.22);font-size:14px;line-height:1.4;transition:background .3s}'
      + '.__a-filling{background:linear-gradient(90deg,#2A4A4F,#1a2f33)}'
      + '.__a-action{background:linear-gradient(90deg,#B09460,#8f7748)}'
      + '.__a-ready{background:linear-gradient(90deg,#1a7f5a,#2A4A4F)}'
      + '.__a-spin{width:18px;height:18px;border:3px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:__aspin .8s linear infinite;flex:0 0 auto}'
      + '.__a-dot{width:9px;height:9px;border-radius:50%;background:#fff;flex:0 0 auto;animation:__apulse 1s ease-in-out infinite}'
      + '.__a-check{width:20px;height:20px;border-radius:50%;background:#fff;color:#1a2f33;display:flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 auto}'
      + '.__a-msg{flex:1}'
      + '.__a-tag{opacity:.75;font-weight:700;letter-spacing:.04em;font-size:11px;text-transform:uppercase;margin-right:8px}';
    (document.head||document.documentElement).appendChild(st);
  }
  }
  // VISIBLE human-verification challenge only - ignore passive invisible reCAPTCHA
  // badges (present on many forms, rarely actually challenge) so we don't cry wolf.
  function bannerDeepAll(sel, root, acc){
    root.querySelectorAll(sel).forEach(function(e){ acc.push(e); });
    root.querySelectorAll('*').forEach(function(e){ if (e.shadowRoot) bannerDeepAll(sel, e.shadowRoot, acc); });
    return acc;
  }
  function hasCaptcha(){
    // Visibility, not existence: a solved hCaptcha challenge iframe stays in the
    // DOM hidden - without these checks the banner said "resuelve el captcha"
    // forever after the user already solved it.
    var frames = bannerDeepAll('iframe[title*="challenge" i], iframe[title*="expires" i], iframe[src*="hcaptcha"], iframe[src*="funcaptcha"], iframe[src*="arkose"], iframe[src*="bframe"]', document, []);
    for (var i=0;i<frames.length;i++){
      // No offsetParent check: challenge overlays are position:fixed and fixed
      // elements report offsetParent null even while visible. Rect 0x0 covers
      // display:none; visibility inherits from hidden ancestors.
      var cs = window.getComputedStyle(frames[i]);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      var r=frames[i].getBoundingClientRect(); if (r.width>60 && r.height>60) return true;
    }
    var t=(document.body&&document.body.innerText||'').toLowerCase();
    return /no a un robot|nos aseguramos de que|verify (you are|you're) human|i'?m not a robot|desliza|slide to|press ?& ?hold|reto de seguridad|security check|completa(r)? el patr[oó]n|complete the (pattern|puzzle)|arrastra|drag (the|each|to)|security code|verification code|c[oó]digo de (seguridad|verificaci[oó]n)|enter (the|your) code|sent (you )?a (security |verification )?code|one[- ]?time (code|password|passcode)|introduce (el|tu) c[oó]digo|hemos enviado un c[oó]digo|check your (e-?mail|inbox) for/i.test(t);
  }
  function countMissing(){
    // SmartRecruiters renders every field inside shadow DOM (its "spl-*" web
    // components) - a plain querySelectorAll always reported 0 missing there,
    // which is why the banner never nudged the user about page-2/3 questions.
    var els = bannerDeepAll('input, select, textarea', document, []); var n=0;
    for (var i=0;i<els.length;i++){ var el=els[i]; var ty=(el.type||'').toLowerCase();
      if (['hidden','submit','button','reset','image','file'].indexOf(ty)!==-1) continue;
      if (el.offsetParent===null || el.disabled) continue;
      var req = el.required || el.getAttribute('aria-required')==='true';
      if (req && !(el.value||'').trim()) n++;
    }
    return n;
  }
  // Rotating sub-messages during 'filling' so the wait feels alive instead of a
  // static frozen line - purely cosmetic, advances on its own each render() tick.
  var fillingMsgs = [
    'Leyendo la vacante...',
    'Eligiendo la mejor respuesta para cada pregunta...',
    'Mejorando tu perfil para este puesto...',
    'Adaptando tus datos al formulario...',
    'Verificando que todo cuadre con tu CV...',
    'Completando los campos que reconoce...'
  ];
  var fillingTick = 0;
  function render(){
    var bar = document.getElementById('__applica_bar'); if(!bar) return;
    var stage = window.__applica_phase || 'filling';
    var cls, dotHtml, msg;
    // Captcha check comes FIRST, in EVERY stage: the challenge usually pops up
    // mid-"filling" (the adapter's own submit click triggers it), and the old
    // order kept showing "estamos llenando, no toques nada" WHILE the user was
    // supposed to be solving the challenge.
    if (hasCaptcha()) {
      cls = '__a-action'; dotHtml = '<span class="__a-dot"></span>';
      msg = '<strong>Tu turno.</strong> Completa la verificaci&oacute;n (captcha o c&oacute;digo enviado a tu correo) y contin&uacute;a. Applica queda en pausa mientras tanto.';
    } else if (stage === 'filling') {
      cls = '__a-filling'; dotHtml = '<span class="__a-spin"></span>';
      var phrase = fillingMsgs[Math.floor(fillingTick/2) % fillingMsgs.length];
      fillingTick++;
      msg = '<strong>Applica est&aacute; llenando tu formulario:</strong> ' + phrase + ' <em>Por favor, no toques nada mientras trabajamos.</em>';
    } else {
      var miss = countMissing();
      if (miss > 0) {
        cls = '__a-action'; dotHtml = '<span class="__a-dot"></span>';
        msg = '<strong>Casi listo.</strong> Completa ' + miss + ' campo(s) marcado(s) y dale <strong>Enviar</strong>.';
      } else {
        cls = '__a-ready'; dotHtml = '<span class="__a-check">&#10003;</span>';
        msg = '<strong>Listo.</strong> Revisa que todo est&eacute; bien y dale <strong>Enviar</strong>. Puedes cerrar esta ventana al terminar.';
      }
    }
    bar.innerHTML = '<div class="__a-row ' + cls + '">' + dotHtml + '<div class="__a-msg"><span class="__a-tag">Applica</span>' + msg + '</div></div>';
  }
  function ensure(){
    ensureStyle(); // React re-renders remove the injected <style>; restore it with the bar
    var bar = document.getElementById('__applica_bar');
    if (!bar) { bar = document.createElement('div'); bar.id='__applica_bar'; (document.body||document.documentElement).appendChild(bar); }
    render();
    try { document.documentElement.style.scrollPaddingTop = '52px'; } catch(e){}
  }
  // Node calls this once when it's done pre-filling ('done'); the banner then
  // keeps re-evaluating the live page (captcha / missing fields / ready) on its
  // own via the interval below, so it reflects the user's progress in real time
  // without further round-trips.
  window.__applicaSetPhase = function(p){ window.__applica_phase = p; render(); };
  ensure();
  setInterval(ensure, 1200); // SPAs re-render and can wipe it, and this also re-checks live state
  } // end setup
})();`;

export async function launchRealBrowserContext(): Promise<BrowserContext | null> {
  // Lazy requires to avoid circular imports.
  const { detectLocalBrowser } = require('./linkedinLocalCapture');
  const path = require('path');
  const os = require('os');
  const local = detectLocalBrowser();
  if (!local?.executablePath) return null;

  const profileDir = path.join(os.tmpdir(), 'applica-apply-profile');

  // If a previous run was force-killed (or the OS/us killed a lingering process),
  // Chromium marks the profile "Crashed" - on next launch it opens a SECOND, empty
  // window offering to restore the old session. Patch it back to a clean exit so
  // only the one window we actually navigate ever appears.
  try {
    const fs = require('fs');
    const prefsPath = path.join(profileDir, 'Default', 'Preferences');
    if (fs.existsSync(prefsPath)) {
      const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      prefs.profile = prefs.profile || {};
      prefs.profile.exit_type = 'Normal';
      prefs.profile.exited_cleanly = true;
      fs.writeFileSync(prefsPath, JSON.stringify(prefs));
    }
  } catch { /* best-effort; a missing/corrupt Preferences file just means a fresh profile */ }

  console.log(`[BrowserManager] Launching REAL browser (${local.name}) with dedicated profile for trusted apply...`);
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: local.executablePath,
    headless: false,
    viewport: null,
    proxy: getProxyFromEnv(),
    chromiumSandbox: true, // keep the OS sandbox on; else Brave shows a "--no-sandbox" security warning
    args: [
      // NOTE: no '--disable-blink-features=AutomationControlled' here - Playwright
      // already passes it; duplicating it made Brave show an "unsupported
      // command-line flag" warning bar (values got joined with a comma).
      '--start-maximized',
      '--disable-dev-shm-usage',
      '--disable-session-crashed-bubble', // belt-and-suspenders: never show the "restore pages?" infobar
      '--hide-crash-restore-bubble',
      // NOTE: do NOT add '--test-type' (any variant) - Brave exits immediately on
      // launch with it. The "unsupported command-line flag" warning bar it would
      // have suppressed is cosmetic and dismissible; the flag causing that bar
      // (Playwright's --disable-blink-features=AutomationControlled) must stay,
      // since dropping it exposes navigator.webdriver to anti-bots.
    ],
    // hide the "automation" banner/flag; also drop --no-sandbox (Playwright adds it by default)
    ignoreDefaultArgs: ['--enable-automation', '--no-sandbox'],
  });
  // Close any extra window/tab the browser opened on its own (e.g. a lingering
  // restored tab) so only the one page we control is ever visible to the user.
  await new Promise((r) => setTimeout(r, 400));
  const extras = context.pages().slice(1);
  for (const p of extras) await p.close().catch(() => {});
  await context.addInitScript(WINDOW_CAPTURE);
  await context.addInitScript(APPLICA_BANNER);
  return context;
}

export async function closeBrowser(): Promise<void> {
  if (globalBrowser) {
    await globalBrowser.close();
    globalBrowser = null;
    console.log('[BrowserManager] Browser closed.');
  }
}
