import { readFileSync } from 'fs';

export function loadEnvLocal() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (!process.env[key]) {
        process.env[key] = rawValue.replace(/^"(.*)"$/, '$1');
      }
    }
  } catch {
    // Next.js loads env vars itself; this helper only serves standalone processes like the worker.
  }
}
