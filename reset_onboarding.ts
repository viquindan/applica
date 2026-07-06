import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { users } from './src/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  await db.update(users).set({ onboardingCompleted: false, onboardingStep: 1 }).where(eq(users.email, 'test@example.com'));
  console.log('Reset successful');
  process.exit(0);
}
main();
