import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export async function saveEvidenceScreenshot(
  applicationId: string,
  screenshotBuffer: Buffer,
  type: 'success' | 'failure' | 'captcha' | (string & {})
): Promise<string> {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const evidenceDir = path.join(uploadDir, 'evidence');

  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true });
  }

  const hash = crypto.randomBytes(4).toString('hex');
  const filename = `app_${applicationId}_${type}_${hash}.png`;
  const filepath = path.join(evidenceDir, filename);

  fs.writeFileSync(filepath, screenshotBuffer);

  // Return the public relative path or API endpoint that serves it
  return `/api/evidence/${filename}`;
}
