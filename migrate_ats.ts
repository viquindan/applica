import { db } from './src/db/client';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Running migration...');
  try {
    await db.execute(sql`ALTER TABLE "greenhouse_boards" RENAME TO "ats_boards"`);
    await db.execute(sql`ALTER TABLE "ats_boards" ADD COLUMN IF NOT EXISTS "platform" varchar(50) DEFAULT 'greenhouse' NOT NULL`);
    await db.execute(sql`ALTER TABLE "greenhouse_board_discoveries" RENAME TO "ats_board_discoveries"`);
    await db.execute(sql`ALTER TABLE "ats_board_discoveries" ADD COLUMN IF NOT EXISTS "platform" varchar(50) DEFAULT 'greenhouse' NOT NULL`);
    await db.execute(sql`ALTER TABLE "ats_boards" DROP CONSTRAINT IF EXISTS "greenhouse_boards_token_unique"`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "platform_token_idx" ON "ats_boards" ("platform", "token")`);
    console.log('Migration successful');
  } catch (e) {
    console.error('Migration failed:', e);
  }
  process.exit(0);
}

migrate();
