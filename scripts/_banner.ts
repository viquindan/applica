// Repro: does the APPLICA_BANNER init script render on the new Greenhouse
// job-boards page? Mirrors launchRealBrowserContext's injection, bundled headless.
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const url = process.argv[2] || 'https://boards.greenhouse.io/6sense/jobs/5542296?gh_jid=5542296';
  const bm = require('../src/core/automation/browserManager');
  const src = require('fs').readFileSync('src/core/automation/browserManager.ts', 'utf8');
  // Extract the APPLICA_BANNER template literal exactly as the module defines it.
  const m = src.match(/const APPLICA_BANNER = `([\s\S]*?)`;\n\nexport async function launchRealBrowserContext/);
  if (!m) { console.error('could not extract banner source'); process.exit(1); }
  const banner = m[1];
  const { chromium } = require('playwright-extra');
  chromium.use(require('puppeteer-extra-plugin-stealth')());
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(banner);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e: any) => errors.push(String(e?.message ?? e)));
  page.on('console', (msg: any) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => {
    const bar = document.getElementById('__applica_bar');
    const style = document.getElementById('__applica_style');
    if (!bar) return { bar: false, style: !!style, init: (window as any).__applicaBannerInit ?? null };
    const cs = getComputedStyle(bar);
    const r = bar.getBoundingClientRect();
    return { bar: true, style: !!style, html: bar.innerHTML.slice(0, 120), position: cs.position, zIndex: cs.zIndex, rect: { w: r.width, h: r.height, top: r.top }, display: cs.display };
  });
  console.log('final url:', page.url());
  console.log('banner state:', JSON.stringify(state, null, 2));
  console.log('page errors:', errors.length ? errors.slice(0, 5) : 'none');
  await page.screenshot({ path: 'uploads/evidence/_banner.png' });
  await browser.close();
  process.exit(0);
}
main().catch(e => { console.error('FAILED:', e?.message ?? e); process.exit(1); });
