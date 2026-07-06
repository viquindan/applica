import { auth } from'@/lib/auth';
import { db } from'@/db/client';
import { professionalProfiles, resumes, users } from'@/db/schema';
import { desc, eq } from'drizzle-orm';
import ProfileClient from'./ProfileClient';

export const metadata = { title: 'Perfil' };

export default async function ProfilePage() {
  const session = await auth();
  const userId = session!.user.id;
  const [[user], [profile], resumeVersions] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId)).limit(1),
    db.select().from(resumes).where(eq(resumes.userId, userId)).orderBy(desc(resumes.createdAt)),
  ]);
  return <ProfileClient user={user} profile={profile} resumes={resumeVersions} />;
}
