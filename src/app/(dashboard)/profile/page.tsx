import { auth } from'@/lib/auth';
import { db } from'@/db/client';
import { applications, professionalProfiles, resumes, users } from'@/db/schema';
import { and, desc, eq, isNotNull, notInArray } from'drizzle-orm';
import ProfileClient from'./ProfileClient';

export const metadata = { title: 'Perfil' };

export default async function ProfilePage() {
  const session = await auth();
  const userId = session!.user.id;
  const [[user], [profile], adaptedResumeRows] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    // Resumes the worker tailored for a specific application (applications.adaptedResumeId)
    // are not "your CVs" - they belong to that application's detail view, not this list.
    db.select({ id: applications.adaptedResumeId }).from(applications)
      .where(and(eq(applications.userId, userId), isNotNull(applications.adaptedResumeId))),
  ]);
  const adaptedResumeIds = adaptedResumeRows.map((r) => r.id).filter((id): id is string => !!id);
  const resumeVersions = await db.select().from(resumes).where(
    adaptedResumeIds.length > 0
      ? and(eq(resumes.userId, userId), notInArray(resumes.id, adaptedResumeIds))
      : eq(resumes.userId, userId)
  ).orderBy(desc(resumes.createdAt));
  return <ProfileClient user={user} profile={profile} resumes={resumeVersions} />;
}
