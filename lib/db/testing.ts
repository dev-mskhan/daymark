/**
 * In-process Postgres (PGlite) harness for migration and RLS tests.
 * Emulates the parts of Supabase the migration depends on: the `auth.users`
 * table, `auth.uid()`, and the anon/authenticated/service_role roles.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';
import type { AppDb } from './index';

const MIGRATIONS_DIR = path.join(process.cwd(), 'drizzle');

const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public, auth to anon, authenticated, service_role;
`;

// Supabase grants table privileges to API roles by default; RLS then decides row access.
const DEFAULT_GRANTS = `
  grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
`;

export async function createTestDatabase() {
  const client = new PGlite();
  await client.exec(SUPABASE_STUBS);
  const files = readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    const statements = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').split('--> statement-breakpoint');
    for (const statement of statements) if (statement.trim()) await client.exec(statement);
  }
  await client.exec(DEFAULT_GRANTS);
  return { client, db: drizzle(client, { schema }) as unknown as AppDb };
}

export type TestClient = PGlite;

export async function createAuthUser(client: PGlite, email: string) {
  const result = await client.query<{ id: string }>('insert into auth.users (email) values ($1) returning id', [email]);
  return result.rows[0].id;
}

/** Runs queries the way a Supabase API request does: as `authenticated` with the user's JWT claims. */
export async function asUser<T>(client: PGlite, userId: string, run: (tx: PGlite) => Promise<T>): Promise<T> {
  return client.transaction(async tx => {
    await tx.exec('set local role authenticated');
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    return run(tx as unknown as PGlite);
  });
}

export async function asAnonymous<T>(client: PGlite, run: (tx: PGlite) => Promise<T>): Promise<T> {
  return client.transaction(async tx => {
    await tx.exec('set local role anon');
    return run(tx as unknown as PGlite);
  });
}
