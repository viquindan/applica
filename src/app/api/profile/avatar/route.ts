import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

// Inlined (don't import from core/tailoring/cvFile - that transitively pulls
// in browserManager.ts, which runs chromium.use(stealth()) at module level
// and breaks Next's page-data collection for this route at build time; real
// incident, 2026-07-23: "TypeError: n.typeOf is not a function" collecting
// page data for /api/profile/avatar, same signature already documented in
// APPLY-ENGINE.md for the 3 LinkedIn routes that hit this before). Keep in
// lockstep with the identical fix in cvFile.ts's own resolveUploadPath and
// extension/resume/route.ts's inline copy.
function resolveUploadPath(p: string): string {
  if (path.isAbsolute(p)) return p;
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const rel = p.startsWith('uploads/') || p.startsWith('uploads\\') ? p.slice('uploads/'.length) : p;
  return path.join(uploadDir, rel);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fd = await req.formData();
  const file = fd.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Formato no soportado (usa JPG, PNG o WEBP)' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'La imagen no puede superar 5MB' }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  // path.resolve, not a bare env-or-fallback string: guarantees an absolute
  // uploadDir (and therefore an absolute stored filePath below) regardless
  // of whether UPLOAD_DIR is set - the relative fallback here is what
  // produced a stored path like "uploads/avatar_..." once (found real,
  // 2026-07-23), which then broke on the next deploy the same way the CV
  // path bug did (see resolveUploadPath in cvFile.ts).
  const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, `avatar_${userId}_${Date.now()}.${ext}`);
  await writeFile(filePath, bytes);

  await db.update(users).set({ avatarPath: filePath, updatedAt: new Date() }).where(eq(users.id, userId));

  return NextResponse.json({ success: true });
}

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user] = await db.select({ avatarPath: users.avatarPath }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.avatarPath) return NextResponse.json({ error: 'no_avatar' }, { status: 404 });

  const ext = user.avatarPath.split('.').pop()?.toLowerCase() ?? 'jpg';
  const contentType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  try {
    const bytes = await readFile(resolveUploadPath(user.avatarPath));
    return new NextResponse(bytes as any, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' },
    });
  } catch {
    return NextResponse.json({ error: 'read_failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await db.update(users).set({ avatarPath: null, updatedAt: new Date() }).where(eq(users.id, userId));
  return NextResponse.json({ success: true });
}
