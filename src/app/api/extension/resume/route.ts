import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { applications, professionalProfiles, resumes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyExtensionToken, extractBearer } from '@/lib/extensionToken';
import { readFile } from 'fs/promises';
import path from 'path';

// Inlined (don't import from core/tailoring/cvFile - that transitively pulls in the
// playwright-extra/stealth automation stack, which throws when loaded in an API route).
const resolveUploadPath = (p: string) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));

const CORS = { 'Access-Control-Allow-Origin': '*' };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization' } });
}

// Streams the tailored (or base) resume PDF for the extension to offer as a
// download, so the user can attach it in one drag (extensions can't set file
// inputs directly). Token-authed to the owning user.
export async function GET(req: NextRequest) {
  const userId = verifyExtensionToken(extractBearer(req));
  if (!userId) return NextResponse.json({ error: 'invalid_token' }, { status: 401, headers: CORS });

  const appId = req.nextUrl.searchParams.get('appId') || '';
  let resumeId: string | null = null;
  if (appId) {
    const [app] = await db.select().from(applications).where(eq(applications.id, appId)).limit(1);
    if (app && app.userId === userId) resumeId = app.adaptedResumeId ?? null;
  }
  if (!resumeId) {
    const [profile] = await db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1);
    resumeId = profile?.baseResumeId ?? null;
  }
  if (!resumeId) return NextResponse.json({ error: 'no_resume' }, { status: 404, headers: CORS });

  const [r] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  if (!r?.filePath) return NextResponse.json({ error: 'no_file' }, { status: 404, headers: CORS });
  const filename = r.filePath.split(/[\\/]/).pop() || 'cv.pdf';
  try {
    const bytes = await readFile(resolveUploadPath(r.filePath));
    return new NextResponse(bytes as any, {
      headers: {
        ...CORS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'read_failed' }, { status: 500, headers: CORS });
  }
}
