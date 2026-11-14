import { NextResponse } from 'next/server';
import { safeNextPath } from '@/lib/auth/redirect';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Task 6.21 — completes Google OAuth (and email-confirmation links) by exchanging the code for a session cookie.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'), '/trips');
  const fail = (reason: string) => NextResponse.redirect(new URL(`/sign-in?error=${reason}`, url.origin));
  const code = url.searchParams.get('code');
  if (!isSupabaseConfigured() || !code) return fail('callback');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail('callback');
  return NextResponse.redirect(new URL(next, url.origin));
}
