import { ApiError } from '@/lib/api/errors';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Resolves the signed-in user from the session cookie, validated against Supabase Auth.
 * The returned id is the only identity trip code may use — never an id from the request body.
 */
export async function requireUser(): Promise<SessionUser> {
  if (!isSupabaseConfigured()) throw new ApiError('unavailable', 'Accounts are not configured on this server.');
  const supabase = await createSupabaseServerClient();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new ApiError('unauthenticated', 'Please sign in to continue.');
    return { id: data.user.id, email: data.user.email ?? null };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Auth service unreachable: treat as signed out rather than surfacing a server error.
    throw new ApiError('unauthenticated', 'Please sign in to continue.');
  }
}
