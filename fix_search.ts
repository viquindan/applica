import { db } from './src/db/client';
import { platformSettings } from './src/db/schema';

async function activate() {
  const userId = '0e1308f0-076b-4b0d-9610-4085bec4496f';

  // Activate Lever
  await db.insert(platformSettings).values({
    userId,
    platformName: 'lever',
    searchEnabled: true,
    status: 'active',
    notes: '',
  }).onConflictDoNothing();
  console.log('[Fix] Lever activated');

  // Activate Ashby
  await db.insert(platformSettings).values({
    userId,
    platformName: 'ashby',
    searchEnabled: true,
    status: 'active',
    notes: '',
  }).onConflictDoNothing();
  console.log('[Fix] Ashby activated');

  // Verify
  const all = await db.select().from(platformSettings);
  console.log('All platforms:', all.map(p => `${p.platformName} (enabled=${p.searchEnabled}, status=${p.status})`));

  process.exit(0);
}
activate();
