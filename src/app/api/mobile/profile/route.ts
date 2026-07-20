import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { applications, professionalProfiles, resumes, users } from '@/db/schema';
import { and, desc, eq, isNotNull, notInArray } from 'drizzle-orm';

// The web Perfil screen is an RSC with no GET route (only PUT /api/profile
// exists, for saving). This feeds the mobile Perfil screen its initial state -
// same query as src/app/(dashboard)/profile/page.tsx, including the exclusion
// of auto-tailored-per-application resumes from the "your CVs" list.
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [[user], [profile], adaptedResumeRows] = await Promise.all([
    // Never select users.* here - it includes the bcrypt password hash. This
    // route hands its response straight to a JSON client, unlike the web RSC
    // page (which has the same underlying risk, but at least isn't a raw
    // fetchable endpoint).
    db.select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      avatarPath: users.avatarPath,
      phone: users.phone, linkedin: users.linkedin, portfolio: users.portfolio, portfolioLinks: users.portfolioLinks,
      location: users.location, country: users.country, languages: users.languages,
      workAuthorization: users.workAuthorization, relocationAvailable: users.relocationAvailable,
      workModality: users.workModality, workModalityPrefs: users.workModalityPrefs,
      salaryMin: users.salaryMin, salaryMax: users.salaryMax, salaryCurrency: users.salaryCurrency,
      noticePeriod: users.noticePeriod, onboardingCompleted: users.onboardingCompleted,
      onboardingStep: users.onboardingStep, preferredLanguage: users.preferredLanguage,
      subscriptionTier: users.subscriptionTier, linkedinSessionStatus: users.linkedinSessionStatus,
      linkedinConnectedAt: users.linkedinConnectedAt, createdAt: users.createdAt, updatedAt: users.updatedAt,
    }).from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    // NOTE: isBase alone is NOT a safe filter here - it only marks the CURRENTLY
    // active upload. A superseded-but-real previous upload has isBase:false too
    // (resumes/base unsets isBase on prior rows) and still needs to show, with
    // its "Activar" action, or that switch-back feature silently breaks. The
    // correct signal for "system-tailored, belongs to one application" is
    // whether some application.adaptedResumeId points at it.
    db.select({ id: applications.adaptedResumeId }).from(applications)
      .where(and(eq(applications.userId, userId), isNotNull(applications.adaptedResumeId))),
  ]);
  const adaptedResumeIds = adaptedResumeRows.map((r) => r.id).filter((id): id is string => !!id);
  const resumeVersions = await db.select().from(resumes).where(
    adaptedResumeIds.length > 0
      ? and(eq(resumes.userId, userId), notInArray(resumes.id, adaptedResumeIds))
      : eq(resumes.userId, userId)
  ).orderBy(desc(resumes.createdAt));

  // One-time soft migration for the display layer only (never written back
  // here): a real user had 3 links jammed into the old single `portfolio`
  // string ("sortcash.org, applica.com, casaocash.com"). If the new array
  // field is still empty, split the legacy value so it doesn't just vanish
  // from the UI - the next real save writes through portfolioLinks properly.
  const portfolioLinks = user.portfolioLinks?.length
    ? user.portfolioLinks
    : (user.portfolio ? user.portfolio.split(',').map((s) => s.trim()).filter(Boolean) : []);

  return NextResponse.json({ user: { ...user, portfolioLinks }, profile, resumes: resumeVersions });
}
