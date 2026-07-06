import { db } from './src/db/client';
import { sql } from 'drizzle-orm';

async function setAdmin() {
  console.log('Setting admin...');
  try {
    await db.execute(sql`
      UPDATE "users" SET "role" = 'admin';
    `);
    console.log('Admin set successful');
  } catch (e) {
    console.error('Failed:', e);
  }
  process.exit(0);
}

setAdmin();
