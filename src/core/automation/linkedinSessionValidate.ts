import { createIncognitoContext } from './browserManager';
import { getLinkedInCookies, markLinkedInSessionExpired } from './linkedinSession';

/**
 * Verifies a stored LinkedIn session by loading the feed with the cookies and
 * checking we land logged-in (not bounced to login/authwall/checkpoint). Marks
 * the session expired if it no longer works. Kept separate from linkedinSession
 * so the basic connect/status API doesn't pull in Playwright.
 */
export async function validateLinkedInSession(userId: string): Promise<{ valid: boolean; reason?: string }> {
  const cookies = await getLinkedInCookies(userId);
  if (!cookies?.length) return { valid: false, reason: 'no_session' };

  const context = await createIncognitoContext();
  try {
    await context.addCookies(cookies as any);
    const page = await context.newPage();
    await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const url = page.url();

    if (/\/(login|authwall|uas\/login|checkpoint)/i.test(url)) {
      await markLinkedInSessionExpired(userId);
      return { valid: false, reason: 'redirected_to_login' };
    }
    // Confirm a logged-in surface is present (global nav / "me" menu).
    let navPresent = false;
    try {
      navPresent = (await page.locator('header.global-nav, [data-test-global-nav], .global-nav__me, button[aria-label*="Me"]').first().count()) > 0;
    } catch { /* ignore */ }

    const valid = navPresent || /linkedin\.com\/feed/i.test(url);
    if (!valid) await markLinkedInSessionExpired(userId);
    return { valid, reason: valid ? undefined : 'not_logged_in' };
  } catch (e: any) {
    return { valid: false, reason: e?.message ?? 'error' };
  } finally {
    await context.close();
  }
}
