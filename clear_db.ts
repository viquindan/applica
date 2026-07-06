import { db } from './src/db/client';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Clearing database...');
  try {
    // Drop all schema tables dynamically or just truncate the public schema
    await db.execute(sql`
      DO $$ DECLARE
          r RECORD;
      BEGIN
          FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
              EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
          END LOOP;
      END $$;
    `);
    console.log('Database cleared successfully!');
  } catch (e) {
    console.error('Error clearing database:', e);
  }
  process.exit(0);
}

main();
