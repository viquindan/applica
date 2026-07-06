import { db } from './src/db/client';
import { professionalProfiles } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function check() {
  const userId = '0e1308f0-076b-4b0d-9610-4085bec4496f';
  const [profile] = await db.select().from(professionalProfiles).where(eq(professionalProfiles.userId, userId));
  console.log('Experience roles:', (profile?.experience as any[])?.map((e: any) => e.role));
  console.log('targetRoles:', profile?.targetRoles);
  console.log('skills:', profile?.skills?.slice(0, 10));
  process.exit(0);
}
check();
