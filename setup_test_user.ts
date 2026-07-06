import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from './src/db/client';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function setupTestUser() {
  console.log('Setting up test user...');
  try {
    // Drop all data if we want to ensure a clean slate
    console.log('Cleaning database...');
    await db.execute(sql`TRUNCATE TABLE users, resumes, professional_profiles, memory_documents CASCADE`);
    
    // Hash password
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // Insert user
    const result = await db.execute(sql`
      INSERT INTO users (id, name, email, password, role, subscription_tier, location)
      VALUES (gen_random_uuid(), 'Test Executive', 'test@example.com', ${hashedPassword}, 'user', 'pro', 'Bogotá, Colombia')
      RETURNING id
    `);
    
    // @ts-ignore
    const userId = result.rows ? result.rows[0].id : result[0].id;
    
    // Insert profile
    await db.execute(sql`
      INSERT INTO professional_profiles (id, user_id, base_resume_id)
      VALUES (gen_random_uuid(), ${userId}, null)
    `);

    // Insert settings
    await db.execute(sql`
      INSERT INTO user_settings (user_id)
      VALUES (${userId})
    `);

    console.log('Test user created successfully!');
    console.log('Email: test@example.com');
    console.log('Password: password123');
    
  } catch (e) {
    console.error('Failed:', e);
  }
  process.exit(0);
}

setupTestUser();
