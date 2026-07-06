import { db } from './src/db/client';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Running migration...');
  try {
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await db.execute(sql`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "user_role" DEFAULT 'user' NOT NULL;
    `);
    console.log('Migration successful');
  } catch (e) {
    console.error('Migration failed:', e);
  }
  process.exit(0);
}

migrate();
