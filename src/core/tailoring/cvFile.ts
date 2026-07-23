import path from 'path';
import fs from 'fs';
import { getBrowser } from '../automation/browserManager';

/**
 * Renders the tailored CV TEXT into a real PDF file (ATS forms need an uploadable
 * file, not just text). Uses the headless Chromium we already run - no extra deps.
 * Returns the ABSOLUTE path of the written PDF.
 */
export async function renderCvToPdf(text: string, fileBase: string): Promise<string> {
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const safeBase = fileBase.replace(/[^a-z0-9_-]/gi, '_');
  const outPath = path.join(uploadDir, `${safeBase}.pdf`);

  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family: Georgia, 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.45; color: #111; margin: 0; padding: 44px 52px; white-space: pre-wrap; word-wrap: break-word; }
  </style></head><body>${escapeHtml(text)}</body></html>`;

  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({ path: outPath, format: 'Letter', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
    return outPath;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Resolve a possibly-relative stored path to an absolute one for file uploads.
 * Resolves against UPLOAD_DIR (the persistent shared uploads dir), NOT
 * process.cwd() - found real (2026-07-23): every release/deploy gets its own
 * fresh checkout directory, so process.cwd() differs from one deploy to the
 * next even though the SAME `applica-current` symlink is what PM2 points at
 * (Node resolves cwd to the real, symlink-free path). A relative path stored
 * once (e.g. a base CV uploaded as "uploads/<uuid>.pdf") worked only until
 * the next deploy, then 404'd against a since-pruned old release directory -
 * intermittent "no hay CV cargable" failures that tracked deploys, not code. */
export function resolveUploadPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const rel = p.startsWith('uploads/') || p.startsWith('uploads\\') ? p.slice('uploads/'.length) : p;
  return path.join(uploadDir, rel);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
