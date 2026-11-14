import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';

const PROTECTED_PAGES = ['/trips'];

/**
 * Refreshes the Supabase session on each request and writes any rotated cookies to the response.
 * Uses getUser() (validated against Supabase Auth), never the unverified cookie contents.
 */
export async function updateSession(request: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  // A network or Auth outage must read as "signed out", never as a server error.
  const user = await supabase.auth.getUser().then(
    ({ data }) => data.user,
    () => null,
  );

  const { pathname } = request.nextUrl;
  if (!user && PROTECTED_PAGES.some(page => pathname === page || pathname.startsWith(`${page}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = '/sign-in';
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return response;
}
