import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { encryptSecret, decryptSecret } from '@/lib/sessionCrypto';

/**
 * LinkedIn automation session management.
 *
 * The "session" is the set of cookies that lets the worker's headless browser
 * act as the logged-in user (primarily `li_at`). It is stored ENCRYPTED and is
 * completely separate from any LinkedIn OAuth login - OAuth gives identity, this
 * gives the ability to drive Easy Apply on the user's behalf.
 */

/**
 * Normalize any LinkedIn URL to the canonical www host. Country subdomains like
 * `pa.linkedin.com` / `mx.linkedin.com` serve a localized GUEST view that doesn't
 * recognize the logged-in session (cookies live on www), breaking the apply flow.
 */
export function normalizeLinkedInUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)linkedin\.com$/i.test(u.hostname)) {
      u.hostname = 'www.linkedin.com';
      // Canonicalize job pages to the stable numeric-id form - slug URLs
      // (".../network-country-manager-at-wtw-4419849672") redirect-loop with a
      // logged-in session (ERR_TOO_MANY_REDIRECTS).
      const m = u.pathname.match(/\/jobs\/view\/(?:.*?-)?(\d{6,})\/?$/);
      if (m) { u.pathname = `/jobs/view/${m[1]}/`; u.search = ''; }
    }
    return u.toString();
  } catch {
    return url;
  }
}

export type PlaywrightCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

export type LinkedInSessionStatus = 'none' | 'connected' | 'expired';

type StoredSession = { cookies: PlaywrightCookie[]; capturedAt: string };

/** Build the Playwright cookie list from a raw `li_at` (+ optional JSESSIONID). */
export function buildLinkedInCookies(input: {
  li_at?: string;
  jsessionid?: string;
  cookies?: PlaywrightCookie[];
}): PlaywrightCookie[] {
  if (input.cookies?.length) return input.cookies;
  const li = (input.li_at ?? '').trim();
  if (!li) return [];
  const cookies: PlaywrightCookie[] = [
    { name: 'li_at', value: li, domain: '.linkedin.com', path: '/', secure: true, httpOnly: true, sameSite: 'None' },
  ];
  if (input.jsessionid) {
    cookies.push({
      name: 'JSESSIONID',
      value: input.jsessionid.replace(/"/g, ''),
      domain: '.www.linkedin.com', path: '/', secure: true, sameSite: 'None',
    });
  }
  return cookies;
}

/** Store (encrypted) the user's LinkedIn cookies and mark the session connected. */
export async function setLinkedInSession(userId: string, cookies: PlaywrightCookie[]): Promise<void> {
  if (!cookies.length || !cookies.some((c) => c.name === 'li_at' && c.value)) {
    throw new Error('A valid li_at cookie is required.');
  }
  const payload: StoredSession = { cookies, capturedAt: new Date().toISOString() };
  await db.update(users).set({
    linkedinSession: encryptSecret(JSON.stringify(payload)),
    linkedinSessionStatus: 'connected',
    linkedinConnectedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(users.id, userId));
}

/** Decrypt and return the user's stored cookies, or null if none/unreadable. */
export async function getLinkedInCookies(userId: string): Promise<PlaywrightCookie[] | null> {
  const [u] = await db.select({ s: users.linkedinSession }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.s) return null;
  try {
    const parsed = JSON.parse(decryptSecret(u.s)) as StoredSession;
    return parsed.cookies ?? null;
  } catch {
    return null;
  }
}

export async function getLinkedInStatus(userId: string): Promise<{ status: LinkedInSessionStatus; connectedAt: Date | null }> {
  const [u] = await db.select({ st: users.linkedinSessionStatus, at: users.linkedinConnectedAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  return { status: (u?.st as LinkedInSessionStatus) ?? 'none', connectedAt: u?.at ?? null };
}

/** Mark the session expired (called by the automation when LinkedIn rejects it). */
export async function markLinkedInSessionExpired(userId: string): Promise<void> {
  await db.update(users).set({ linkedinSessionStatus: 'expired', updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function clearLinkedInSession(userId: string): Promise<void> {
  await db.update(users).set({
    linkedinSession: null, linkedinSessionStatus: 'none', linkedinConnectedAt: null, updatedAt: new Date(),
  }).where(eq(users.id, userId));
}
