import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Stateless per-user token for the Applica browser extension. The extension can't
 * reliably send the NextAuth session cookie (cross-site SameSite rules), so the
 * user pastes this token into the extension once. It's an HMAC of the user id, so
 * no DB column/migration is needed and it can't be forged without AUTH_SECRET.
 * Format: base64url(userId).base64url(hmac).
 */
const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'applica-dev-secret';

const b64url = (buf: Buffer) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(userId: string): string {
  return b64url(createHmac('sha256', SECRET).update(userId).digest());
}

export function signExtensionToken(userId: string): string {
  return `${b64url(Buffer.from(userId))}.${sign(userId)}`;
}

export function verifyExtensionToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const [idPart, sigPart] = token.trim().split('.');
  if (!idPart || !sigPart) return null;
  let userId: string;
  try {
    userId = fromB64url(idPart).toString('utf8');
  } catch {
    return null;
  }
  const expected = sign(userId);
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}

/** Pull a Bearer token from an Authorization header (or a `token` query param). */
export function extractBearer(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  try {
    const url = new URL(req.url);
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}
