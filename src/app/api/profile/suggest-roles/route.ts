import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { professionalProfiles, resumes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { suggestTargetRoles } from '@/core/profile/suggestRoles';

/**
 * Analyzes the candidate's CV/profile and suggests realistic target roles.
 * When `save` is true (default) the suggestions are registered as targetRoles;
 * the user can then remove any or add their own via the normal profile editor.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => ({}));
  const save = body.save !== false;

  const [profile] = await db.select().from(professionalProfiles)
    .where(eq(professionalProfiles.userId, userId)).limit(1);
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  const [baseResume] = profile.baseResumeId
    ? await db.select().from(resumes).where(eq(resumes.id, profile.baseResumeId)).limit(1)
    : [null];

  const suggestions = await suggestTargetRoles({ profile, resumeText: baseResume?.textContent });
  const titles = suggestions.map((s) => s.title);

  if (save && titles.length) {
    await db.update(professionalProfiles)
      .set({ targetRoles: titles, updatedAt: new Date() })
      .where(eq(professionalProfiles.userId, userId));
  }

  return NextResponse.json({
    suggestions,
    saved: save && titles.length > 0,
    previousRoles: profile.targetRoles ?? [],
  });
}
