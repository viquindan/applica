import { auth } from'@/lib/auth';
import { db } from'@/db/client';
import { userSettings, platformSettings, users } from'@/db/schema';
import { eq } from'drizzle-orm';
import SettingsClient from'./SettingsClient';
import LinkedInConnectCard from'./LinkedInConnectCard';

export default async function SettingsPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [[settings], platforms, [u]] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1),
    db.select().from(platformSettings).where(eq(platformSettings.userId, userId)),
    db.select({ st: users.linkedinSessionStatus }).from(users).where(eq(users.id, userId)).limit(1),
  ]);

  return (
    <>
      <LinkedInConnectCard initialStatus={(u?.st as'none' | 'connected' | 'expired') ?? 'none'} />
      <SettingsClient settings={settings} platforms={platforms} />
    </>
  );
}
