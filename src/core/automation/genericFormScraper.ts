import { createIncognitoContext } from './browserManager';

/**
 * Best-effort scraper for unknown/custom application forms. We can't reliably
 * SUBMIT arbitrary sites, but we CAN read their questions so the agent can draft
 * answers and leave everything ready for the user to apply in seconds.
 */
export async function scrapeGenericFormQuestions(url: string): Promise<string[]> {
  const context = await createIncognitoContext();
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Try to reveal the form if it's behind an "Apply" / "I'm interested" button.
    const startBtn = page.locator('a:has-text("Apply"), button:has-text("Apply"), button:has-text("I\'m interested"), a:has-text("Aplicar"), button:has-text("Aplicar")').first();
    if (await startBtn.count()) { await startBtn.click().catch(() => undefined); await page.waitForTimeout(1800); }

    const labels = await page.evaluate(() => {
      const out: string[] = [];
      const fields = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea, select'));
      for (const f of fields) {
        const el = f as HTMLElement;
        let label = '';
        const id = el.getAttribute('id');
        if (id) { const l = document.querySelector(`label[for="${id}"]`); if (l) label = l.textContent || ''; }
        if (!label) { const wrap = el.closest('label'); if (wrap) label = wrap.textContent || ''; }
        if (!label) label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '';
        label = label.replace(/\s+/g, ' ').trim();
        if (label && label.length >= 2 && label.length < 160) out.push(label);
      }
      return Array.from(new Set(out));
    }).catch(() => [] as string[]);

    return labels;
  } catch {
    return [];
  } finally {
    await context.close().catch(() => undefined);
  }
}
