import { auth } from'@/lib/auth';
import { db } from'@/db/client';
import { professionalProfiles, resumes, users } from'@/db/schema';
import { and, desc, eq } from'drizzle-orm';
import ProfileClient from'./ProfileClient';

export const metadata = { title: 'Perfil' };

export default async function ProfilePage() {
  const session = await auth();
  const userId = session!.user.id;
  const [[user], [profile], resumeVersions] = await Promise.all([
    // Never select users.* - it includes the bcrypt password hash, which Next
    // ships to the browser in the RSC payload passed to a Client Component
    // (found and fixed for the mobile equivalent of this query earlier).
    db.select({
      id: users.id, name: users.name, email: users.email, avatarPath: users.avatarPath,
      phone: users.phone, linkedin: users.linkedin, portfolio: users.portfolio,
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
    // isBase is set true ONLY on user-uploaded resumes (resumes/base,
    // onboarding save); every auto-tailored-per-application resume is
    // inserted isBase:false and belongs to that application's detail view,
    // not this "your CVs" list. Filtering on isBase directly (rather than
    // "not referenced by any application.adaptedResumeId") also hides
    // resumes orphaned by a job that created the tailored row but crashed
    // before linking it back to the application.
    db.select().from(resumes)
      .where(and(eq(resumes.userId, userId), eq(resumes.isBase, true)))
      .orderBy(desc(resumes.createdAt)),
  ]);
  return <ProfileClient user={user} profile={profile} resumes={resumeVersions} />;
}
