import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file);
}

// Migrations use the direct Supabase connection (DIRECT_URL); generating SQL needs no database.
export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DIRECT_URL ?? '' },
});
