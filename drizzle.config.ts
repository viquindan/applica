import { defineConfig } from 'drizzle-kit';
import { readFileSync } from 'fs';

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!match) continue;
  const [, key, rawValue] = match;
  if (!process.env[key]) {
    process.env[key] = rawValue.replace(/^"(.*)"$/, '$1');
  }
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
