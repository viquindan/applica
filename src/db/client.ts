import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { Pool } from 'pg';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL!;
// Neon's HTTP driver only understands neon.tech hostnames (it rewrites the
// host into an api.<host>/sql fetch URL) - any other Postgres, including a
// local instance, needs the plain TCP (node-postgres) driver instead.
const isNeon = /neon\.tech/.test(url);

// Both drivers implement the same query-builder surface at runtime; typed as
// NodePgDatabase so call sites get one consistent set of method overloads.
export const db = (
  isNeon
    ? drizzleNeon(neon(url), { schema })
    : drizzlePg(new Pool({ connectionString: url }), { schema })
) as unknown as NodePgDatabase<typeof schema>;

export type DB = typeof db;
