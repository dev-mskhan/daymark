import type { SupabaseClient } from '@supabase/supabase-js';

type EmailLinkAuth = Pick<SupabaseClient['auth'], 'signInWithOtp'>;

export async function requestEmailSignIn(
  auth: EmailLinkAuth,
  email: string,
  redirectTo: string,
): Promise<void> {
  const { error } = await auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  if (error) throw error;
}
