import fs from 'fs';
import os from 'os';
import path from 'path';
import { chromium } from 'playwright';
import { setLinkedInSession, type PlaywrightCookie } from './linkedinSession';

/**
 * Capture the LinkedIn session from the user's OWN installed browser (Brave /
 * Chrome / Edge) using their REAL profile - so they're already logged in and
 * don't have to sign in again. Works because the worker runs locally.
 *
 * We copy the profile's cookies + Local State to a temp dir and launch the user's
 * real browser binary against that copy (so it decrypts its own cookies via the
 * same OS user) WITHOUT touching/locking their live profile. If they're already
 * logged into LinkedIn instant capture; if not they log in in that window.
 */

export type LocalBrowser = { name: string; executablePath: string; userDataDir: string };

export function detectLocalBrowser(): LocalBrowser | null {
  // Allow explicit override.
  if (process.env.LINKEDIN_BROWSER_PATH && process.env.LINKEDIN_BROWSER_USERDATA) {
    return { name: 'custom', executablePath: process.env.LINKEDIN_BROWSER_PATH, userDataDir: process.env.LINKEDIN_BROWSER_USERDATA };
  }
  const LA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const PF = process.env['ProgramFiles'] || 'C:\\Program Files';
  const PF86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const candidates: LocalBrowser[] = [
    { name: 'brave', executablePath: path.join(PF, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), userDataDir: path.join(LA, 'BraveSoftware', 'Brave-Browser', 'User Data') },
    { name: 'chrome', executablePath: path.join(PF, 'Google', 'Chrome', 'Application', 'chrome.exe'), userDataDir: path.join(LA, 'Google', 'Chrome', 'User Data') },
    { name: 'edge', executablePath: path.join(PF86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), userDataDir: path.join(LA, 'Microsoft', 'Edge', 'User Data') },
  ];
  // Honor a preferred browser by name if set.
  const pref = (process.env.LINKEDIN_BROWSER || '').toLowerCase();
  const ordered = pref ? [...candidates].sort((a) => (a.name === pref ? -1 : 1)) : candidates;
  for (const c of ordered) {
    if (fs.existsSync(c.executablePath) && fs.existsSync(path.join(c.userDataDir, 'Default', 'Network', 'Cookies'))) return c;
  }
  return null;
}

function copyProfileEssentials(userDataDir: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'applica-li-'));
  fs.mkdirSync(path.join(tmp, 'Default', 'Network'), { recursive: true });
  const copy = (rel: string, optional = false) => {
    const src = path.join(userDataDir, rel);
    const dst = path.join(tmp, rel);
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    } catch (e: any) {
      // The cookies DB is locked while the browser is running.
      if (!optional && (e?.code === 'EBUSY' || e?.code === 'EPERM')) throw new Error('browser_running');
      if (!optional) throw e;
    }
  };
  copy('Local State'); // holds the cookie-decryption key
  copy('Default/Network/Cookies'); // the cookies DB (required)
  copy('Default/Network/Cookies-wal', true); // WAL/SHM if present
  copy('Default/Network/Cookies-shm', true);
  copy('Default/Preferences', true);
  return tmp;
}

export async function captureLinkedInFromLocalBrowser(
  userId: string,
  opts?: { timeoutMs?: number },
): Promise<{ ok: boolean; reason?: string; browser?: string }> {
  const browser = detectLocalBrowser();
  if (!browser) return { ok: false, reason: 'no_local_browser' };

  let tempDir: string;
  try {
    tempDir = copyProfileEssentials(browser.userDataDir);
  } catch (e: any) {
    if (e?.message === 'browser_running') return { ok: false, reason: 'browser_running', browser: browser.name };
    return { ok: false, reason: `profile_copy_failed:${e?.message ?? e}`, browser: browser.name };
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(tempDir, {
      executablePath: browser.executablePath,
      headless: false,
      args: ['--no-first-run', '--no-default-browser-check', '--disable-blink-features=AutomationControlled'],
      viewport: null as any,
    });
  } catch (e: any) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return { ok: false, reason: `launch_failed:${e?.message ?? e}`, browser: browser.name };
  }

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined);

    // Poll until we have a li_at cookie (already logged in immediate; otherwise
    // the user signs in in this window using their real browser).
    const deadline = Date.now() + (opts?.timeoutMs ?? 180_000);
    let liAt = false;
    while (Date.now() < deadline) {
      const cookies = await context.cookies('https://www.linkedin.com').catch(() => [] as any[]);
      if (cookies.some((c: any) => c.name === 'li_at' && c.value)) { liAt = true; break; }
      // If they need to log in, nudge them to the login page once.
      if (/\/(login|authwall)/i.test(page.url())) { /* stay; user logs in */ }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!liAt) return { ok: false, reason: 'timeout', browser: browser.name };

    // Ensure the full session settled, then capture.
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    const all = await context.cookies('https://www.linkedin.com');
    const mapped: PlaywrightCookie[] = all.map((c) => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      secure: c.secure, httpOnly: c.httpOnly, sameSite: (c.sameSite as any) ?? 'None',
    }));
    if (!mapped.some((c) => c.name === 'li_at' && c.value)) return { ok: false, reason: 'no_li_at', browser: browser.name };
    await setLinkedInSession(userId, mapped);
    return { ok: true, browser: browser.name };
  } catch (e: any) {
    return { ok: false, reason: e?.message ?? 'error', browser: browser.name };
  } finally {
    await context.close().catch(() => undefined);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
