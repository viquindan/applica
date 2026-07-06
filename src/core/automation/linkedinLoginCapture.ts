import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium, type BrowserContext } from 'playwright';
import { detectLocalBrowser } from './linkedinLocalCapture';
import { setLinkedInSession, type PlaywrightCookie } from './linkedinSession';

/**
 * Assisted LinkedIn login: opens a REAL visible window for the user to sign in,
 * then captures the session cookies. It launches the user's OWN browser binary
 * (Brave / Chrome / Edge) with a fresh temp profile, so the login window is the
 * browser they actually use - not a generic Chromium. Falls back to bundled
 * Chromium only if no local browser is found.
 */
export async function captureLinkedInLogin(
  userId: string,
  opts?: { timeoutMs?: number },
): Promise<{ ok: boolean; reason?: string; browser?: string }> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const local = detectLocalBrowser();

  let context: BrowserContext;
  let close: () => Promise<void>;
  let tempDir: string | undefined;
  try {
    if (local) {
      // Launch the user's real browser (fresh temp profile so it doesn't conflict
      // with their running instance) - the login window IS their browser.
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'applica-li-login-'));
      context = await chromium.launchPersistentContext(tempDir, {
        executablePath: local.executablePath,
        headless: false,
        args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
        viewport: null as any,
      });
      close = () => context.close();
    } else {
      const browser = await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
      context = await browser.newContext({ viewport: { width: 1120, height: 820 }, locale: 'en-US' });
      close = () => browser.close();
    }
  } catch (e: any) {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    return { ok: false, reason: `no_display:${e?.message ?? 'cannot launch a visible browser here'}` };
  }

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const deadline = Date.now() + timeoutMs;
    let liAtSeen = false;
    while (Date.now() < deadline) {
      let cookies;
      try {
        cookies = await context.cookies('https://www.linkedin.com');
      } catch {
        return { ok: false, reason: 'window_closed', browser: local?.name };
      }
      if (cookies.some((c) => c.name === 'li_at' && c.value)) { liAtSeen = true; break; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!liAtSeen) return { ok: false, reason: 'timeout', browser: local?.name };

    // Load the feed so LinkedIn establishes the FULL session before we capture.
    try {
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.waitForTimeout(2500);
    } catch { /* keep whatever we have */ }
    const all = await context.cookies('https://www.linkedin.com');
    const mapped: PlaywrightCookie[] = all.map((c) => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: (c.sameSite as PlaywrightCookie['sameSite']) ?? 'None',
    }));
    await setLinkedInSession(userId, mapped);
    return { ok: true, browser: local?.name };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'error', browser: local?.name };
  } finally {
    await close().catch(() => undefined);
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
