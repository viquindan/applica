import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

/** Dumps the real application-form DOM for a [TEST] app so we can fix adapter selectors.
 * Usage: npx tsx scripts/_dom.ts <platform> */
async function main() {
  const platform = process.argv[2];
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');
  const { createIncognitoContext } = await import('../src/core/automation/browserManager');

  const [row] = (await db.execute(sql`SELECT v.url FROM applications a JOIN vacancies v ON v.id=a.vacancy_id WHERE v.title LIKE '[TEST]%' AND v.platform=${platform} ORDER BY v.title LIMIT 1`)).rows as any[];
  if (!row) { console.error('no test app for', platform); process.exit(1); }
  let url = row.url as string;
  if (platform === 'ashby' && !url.endsWith('/application')) url = `${url}/application`;
  if (platform === 'lever' && !url.endsWith('/apply')) url = `${url}/apply`;
  console.log('URL:', url);

  const ctx = await createIncognitoContext();
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(6000); // let SPA render

  const clickText = process.argv[3];
  if (clickText) {
    const btn = page.getByRole('button', { name: new RegExp(clickText, 'i') }).first()
      .or(page.getByRole('link', { name: new RegExp(clickText, 'i') }).first());
    if (await btn.count()) {
      console.log(`Clicking "${clickText}"...`);
      await Promise.all([
        page.waitForLoadState('domcontentloaded').catch(() => undefined),
        btn.click().catch(() => undefined),
      ]);
      await page.waitForTimeout(6000);
      console.log('After click, URL:', page.url());
    } else console.log(`Button "${clickText}" not found`);
  }

  const dump = await page.evaluate(() => {
    const out: any = { url: location.href, title: document.title, inputs: [], buttons: [], fieldGroups: [] };
    for (const el of Array.from(document.querySelectorAll('input, select, textarea'))) {
      const i = el as HTMLInputElement;
      if (i.type === 'hidden') continue;
      const id = i.id || '';
      let labelText = '';
      if (id) labelText = document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() || '';
      if (!labelText) labelText = (i.closest('label') as HTMLElement)?.textContent?.trim() || '';
      const r = i.getBoundingClientRect();
      out.inputs.push({
        tag: i.tagName.toLowerCase(), type: i.type, name: i.name || '', id,
        ariaLabel: i.getAttribute('aria-label') || '', placeholder: i.placeholder || '',
        required: i.required || i.getAttribute('aria-required') === 'true',
        label: labelText.slice(0, 80), visible: r.width > 0 && r.height > 0,
      });
    }
    for (const el of Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]'))) {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      out.buttons.push({ text: (el.textContent || (el as HTMLInputElement).value || '').trim().slice(0, 50), type: (el as HTMLButtonElement).type || '' });
    }
    for (const el of Array.from(document.querySelectorAll('[class*="field" i], fieldset, [class*="question" i]'))) {
      const lbl = el.querySelector('label, legend, [class*="label" i]')?.textContent?.trim();
      const hasControl = el.querySelector('input, select, textarea, [role="radio"], [role="checkbox"], [role="combobox"]');
      if (lbl && hasControl && lbl.length < 120) out.fieldGroups.push(lbl.replace(/\s+/g, ' '));
    }
    out.fieldGroups = Array.from(new Set(out.fieldGroups));
    return out;
  });

  console.log('\n=== INPUTS ===');
  for (const i of dump.inputs) console.log(` [${i.visible ? 'V' : ' '}] ${i.tag}/${i.type} name="${i.name}" id="${i.id}" req=${i.required} aria="${i.ariaLabel}" ph="${i.placeholder}" label="${i.label}"`);
  console.log('\n=== BUTTONS ===');
  for (const b of dump.buttons) console.log(` "${b.text}" (${b.type})`);
  console.log('\n=== FIELD GROUPS (questions) ===');
  for (const g of dump.fieldGroups) console.log(` • ${g}`);
  await ctx.close();
  process.exit(0);
}
main().catch((e) => { console.error('DOM ERR:', e?.message || e); process.exit(1); });
