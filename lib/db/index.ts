import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

/** Driver-agnostic handle so repositories run on postgres-js in production and PGlite in tests. */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export class DatabaseConfigError extends Error {
  constructor() {
    super('The database is not configured. Set DATABASE_URL.');
    this.name = 'DatabaseConfigError';
  }
}

let cached: AppDb | undefined;

/** Server-only. Uses the Supabase transaction-mode pooler, so prepared statements are disabled. */
export function getDb(): AppDb {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DatabaseConfigError();
  cached = drizzle(postgres(url, { prepare: false }), { schema });
  return cached;
}
