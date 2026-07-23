import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Short-lived, signed capability token for viewing/controlling a live assisted-
 * apply session via noVNC (docs/APPLY-ENGINE.md §4/§5 + the live-session plan,
 * 2026-07-22). Same HMAC scheme as extensionToken.ts, but with a payload +
 * expiry instead of just a user id - VNC has no per-user access control of its
 * own, so this token is the ONLY thing standing between "my captcha" and
 * "anyone's captcha". Possessing a validly-signed, unexpired token proves it
 * was minted by GET /api/applications/[id]/live-session for an owner who was
 * already authenticated there - the token itself doesn't need to re-carry the
 * user id.
 */
const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'applica-dev-secret';
// Matches ASSISTED_SESSION_MAX_MS (the session's own hard ceiling in
// live-session/route.ts and verify-live-session/route.ts) rather than a
// short 5min window - a backgrounded mobile WebView drops its WebSocket
// (Android throttles background network activity, found real via user
// feedback) and needs to reconnect with THIS SAME token; a short TTL made
// that reconnect fail with a stale-looking 401 well before the underlying
// assisted session itself had actually ended.
const TTL_MS = 15 * 60 * 1000;

type Payload = { applicationId: string; poolIndex: number; exp: number };

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(payload: string): string {
  return b64url(createHmac('sha256', SECRET).update(payload).digest());
}

export function signLiveSessionToken(applicationId: string, poolIndex: number): string {
  const payload: Payload = { applicationId, poolIndex, exp: Date.now() + TTL_MS };
  const json = JSON.stringify(payload);
  return `${b64url(Buffer.from(json))}.${sign(json)}`;
}

/** Signature + expiry only - the caller still has to check the token's claims
 * (applicationId/poolIndex) against LIVE DB state, since a session can end and
 * its pool slot get reassigned to someone else within the token's own TTL. */
export function verifyLiveSessionToken(token: string | null | undefined): Payload | null {
  if (!token) return null;
  const [dataPart, sigPart] = token.trim().split('.');
  if (!dataPart || !sigPart) return null;
  let json: string;
  try {
    json = fromB64url(dataPart).toString('utf8');
  } catch {
    return null;
  }
  const expected = sign(json);
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: Payload;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;
  return payload;
}
