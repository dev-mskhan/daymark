import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig } from './config';

/** Server-side client bound to the request's session cookies (Server Components, route handlers). */
export async function createSupabaseServerClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Authentication is not configured.');
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only; middleware refreshes the session instead.
        }
      },
    },
  });
}
