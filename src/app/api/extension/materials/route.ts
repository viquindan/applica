import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { applications, vacancies, users, professionalProfiles, resumes, coverLetters } from '@/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { verifyExtensionToken, extractBearer } from '@/lib/extensionToken';
import { getReusableAnswersMap } from '@/core/memory/memoryStore';

// The Applica browser extension calls this from an ATS application page to get
// everything it needs to autofill: the user's profile, the tailored answers for
// this specific job (if we prepared them), and the learned answer bank. Auth is a
// per-user bearer token (see extensionToken.ts) since the extension can't send the
// session cookie cross-site. CORS is open so a content script on any ATS origin
// can read the response.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    // Strip trailing /apply or /application and any query/hash so the current page
    // URL matches the stored vacancy URL regardless of the exact apply sub-path.
    let path = url.pathname.replace(/\/(apply|application)\/?$/i, '').replace(/\/+$/, '');
    return `${url.host}${path}`.toLowerCase();
  } catch {
    return (u || '').toLowerCase();
  }
}

export async function GET(req: NextRequest) {
  const userId = verifyExtensionToken(extractBearer(req));
  if (!userId) return NextResponse.json({ error: 'invalid_token' }, { status: 401, headers: CORS });

  const pageUrl = req.nextUrl.searchParams.get('url') || '';
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: 'no_user' }, { status: 404, headers: CORS });
  const [profile] = await db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1);

  // Find the application this page corresponds to (match on normalized vacancy URL)
  // so we can hand back the AI-tailored answers we already generated for it.
  const target = normalizeUrl(pageUrl);
  const rows = await db.select({ app: applications, vac: vacancies })
    .from(applications)
    .innerJoin(vacancies, eq(applications.vacancyId, vacancies.id))
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt))
    .limit(200);
  const matched = rows.find((r) => r.vac.url && normalizeUrl(r.vac.url) === target)
    || rows.find((r) => r.vac.url && target && (normalizeUrl(r.vac.url).includes(target) || target.includes(normalizeUrl(r.vac.url))));

  const appAnswers = (matched?.app.formAnswers as Record<string, string>) ?? {};
  const bank = (await getReusableAnswersMap(userId).catch(() => ({}))) as Record<string, string>;
  const answers = { ...bank, ...appAnswers }; // app-specific tailored answers win

  // Resume: extensions can't set <input type=file> for security, so we return the
  // filename + a download URL for the user to attach in one drag if the ATS doesn't
  // autofill from a stored resume.
  let resume: { filename: string; url: string } | null = null;
  const resumeId = matched?.app.adaptedResumeId || profile?.baseResumeId;
  if (resumeId) {
    const [r] = await db.select().from(resumes).where(eq(resumes.id, resumeId)).limit(1);
    if (r?.filePath) resume = { filename: r.filePath.split(/[\\/]/).pop() || 'cv.pdf', url: `/api/extension/resume?token=${extractBearer(req)}&appId=${matched?.app.id ?? ''}` };
  }
  let coverLetter: string | null = null;
  if (matched?.app.coverLetterId) {
    const [cl] = await db.select().from(coverLetters).where(eq(coverLetters.id, matched.app.coverLetterId)).limit(1);
    coverLetter = cl?.content ?? null;
  }

  const name = String(user.name || '');
  return NextResponse.json({
    matched: !!matched,
    applicationId: matched?.app.id ?? null,
    profile: {
      firstName: name.split(' ')[0] || '',
      lastName: name.split(' ').slice(1).join(' ') || '',
      fullName: name,
      email: user.email,
      phone: user.phone || '',
      linkedin: user.linkedin || '',
      portfolio: user.portfolio || '',
      country: user.country || '',
      city: user.location || '',
    },
    answers,
    coverLetter,
    resume,
  }, { headers: CORS });
}
