import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import type { PlaywrightCookie } from './linkedinSession';

/**
 * SILENT LinkedIn session capture: reads the cookies straight from the user's
 * installed browser profile (Brave/Chrome/Edge) and decrypts them locally - no
 * window opens, no need to close the browser. Works because the worker runs on
 * the user's own machine (Windows).
 *
 * - cookies live in an SQLite DB we open read-only (works while the browser runs)
 * - values are AES-256-GCM encrypted with a key stored (DPAPI-protected) in
 * "Local State"; we DPAPI-unprotect the key via PowerShell, then decrypt.
 */

type Browser = { name: string; userDataDir: string };

function detectBrowsers(): Browser[] {
  const LA = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const all: Browser[] = [
    { name: 'brave', userDataDir: path.join(LA, 'BraveSoftware', 'Brave-Browser', 'User Data') },
    { name: 'chrome', userDataDir: path.join(LA, 'Google', 'Chrome', 'User Data') },
    { name: 'edge', userDataDir: path.join(LA, 'Microsoft', 'Edge', 'User Data') },
  ];
  const pref = (process.env.LINKEDIN_BROWSER || '').toLowerCase();
  const ordered = pref ? [...all].sort((a) => (a.name === pref ? -1 : 1)) : all;
  return ordered.filter((b) => fs.existsSync(path.join(b.userDataDir, 'Local State')));
}

function getAesKey(userDataDir: string): Buffer {
  const localState = JSON.parse(fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8'));
  const encKey = Buffer.from(localState.os_crypt.encrypted_key, 'base64');
  const dpapiBlob = encKey.subarray(5); // strip "DPAPI" prefix
  const ps = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String('${dpapiBlob.toString('base64')}'); $d=[System.Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); [Convert]::ToBase64String($d)`;
  const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).trim();
  return Buffer.from(out, 'base64');
}

function decryptValue(buf: Buffer, key: Buffer): string | null {
  if (!buf || buf.length === 0) return null;
  const prefix = buf.subarray(0, 3).toString('latin1');
  if (prefix === 'v10' || prefix === 'v11') {
    const nonce = buf.subarray(3, 15);
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(15, buf.length - 16);
    try {
      const dec = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      dec.setAuthTag(tag);
      return Buffer.concat([dec.update(ct), dec.final()]).toString('utf8');
    } catch { return null; }
  }
  return null; // v20 app-bound or unknown - not supported by this path
}

function profileDirs(userDataDir: string): string[] {
  const out: string[] = [];
  for (const p of ['Default', 'Profile 1', 'Profile 2', 'Profile 3']) {
    if (fs.existsSync(path.join(userDataDir, p, 'Network', 'Cookies'))) out.push(p);
  }
  return out;
}

/** Read & decrypt LinkedIn cookies from a browser profile. */
function readLinkedInCookies(userDataDir: string): { cookies: PlaywrightCookie[]; locked: boolean } {
  const key = getAesKey(userDataDir);
  // node:sqlite is built in on Node 22+ (experimental); typed loosely as the
  // @types/node in use may not declare it.
  const { DatabaseSync } = require('node:sqlite') as { DatabaseSync: any };

  let locked = false;
  for (const prof of profileDirs(userDataDir)) {
    const cookiesPath = path.join(userDataDir, prof, 'Network', 'Cookies');
    let db: any;
    try {
      db = new DatabaseSync(cookiesPath, { readOnly: true });
      const rows = db.prepare(
        "SELECT host_key, name, encrypted_value, path, is_secure, is_httponly FROM cookies WHERE host_key LIKE '%linkedin.com'",
      ).all() as any[];
      const cookies: PlaywrightCookie[] = [];
      for (const r of rows) {
        const value = decryptValue(Buffer.from(r.encrypted_value), key);
        if (!value) continue;
        cookies.push({
          name: r.name,
          value,
          domain: r.host_key,
          path: r.path || '/',
          secure: !!r.is_secure,
          httpOnly: !!r.is_httponly,
          sameSite: 'None',
        });
      }
      if (cookies.some((c) => c.name === 'li_at' && c.value)) return { cookies, locked: false };
    } catch (e: any) {
      // "unable to open database file" = the browser is running and holds a lock.
      if (/unable to open database/i.test(String(e?.message ?? ''))) locked = true;
    } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }
  return { cookies: [], locked };
}

export type SilentCaptureResult = { ok: boolean; reason?: string; browser?: string; cookies?: PlaywrightCookie[] };

/** Try every installed browser; return the first with a usable LinkedIn session. */
export function captureLinkedInCookiesSilently(): SilentCaptureResult {
  const browsers = detectBrowsers();
  if (!browsers.length) return { ok: false, reason: 'no_local_browser' };
  let anyLocked = false;
  let lockedBrowser: string | undefined;
  for (const b of browsers) {
    try {
      const { cookies, locked } = readLinkedInCookies(b.userDataDir);
      if (cookies.length) return { ok: true, browser: b.name, cookies };
      if (locked) { anyLocked = true; lockedBrowser = lockedBrowser ?? b.name; }
    } catch {
      // try next browser
    }
  }
  if (anyLocked) return { ok: false, reason: 'browser_running', browser: lockedBrowser };
  return { ok: false, reason: 'no_linkedin_session' };
}
