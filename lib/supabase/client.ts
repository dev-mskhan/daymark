import { createBrowserClient } from '@supabase/ssr';

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them into the browser bundle.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Authentication is not configured.');
  return createBrowserClient(url, key);
}
