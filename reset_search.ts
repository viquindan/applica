import { db } from './src/db/client';
import { userSettings } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function fix() {
  const userId = '0e1308f0-076b-4b0d-9610-4085bec4496f';
  await db.update(userSettings).set({ searchInProgress: false, lastSearchStatus: 'failed' }).where(eq(userSettings.userId, userId));
  console.log('Fixed search state');
  process.exit(0);
}
fix();
