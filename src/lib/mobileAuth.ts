import { extractBearer, verifyExtensionToken } from './extensionToken';
import { auth } from './auth';

/**
 * Auth bridge for routes reused by both the web app (session cookie) and the
 * mobile app / extension (bearer token - no cookie jar to share). Bearer is a
 * proper superset check: mobile reuses the extension's stateless HMAC token
 * scheme as-is rather than inventing new crypto (see extensionToken.ts).
 */
export async function getAuthUserId(req: Request): Promise<string | null> {
  const bearerUserId = verifyExtensionToken(extractBearer(req));
  if (bearerUserId) return bearerUserId;
  const session = await auth();
  return session?.user?.id ?? null;
}
