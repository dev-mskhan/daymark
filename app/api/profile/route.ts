import { authed, parseBody } from '@/lib/api/handler';
import { getOrCreateProfile, updateProfile } from '@/lib/trips/repository';
import { profileSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';

const view = (profile: { displayName: string | null; themePreference: string }, email: string | null) => ({
  email, displayName: profile.displayName, themePreference: profile.themePreference,
});

export const GET = authed(async ({ user, db }) => Response.json({ profile: view(await getOrCreateProfile(db, user.id), user.email) }));

// Task 5.18 — the theme preference is stored per authenticated user.
export const PATCH = authed(async ({ request, user, db }) => {
  const patch = await parseBody(request, profileSchema);
  return Response.json({ profile: view(await updateProfile(db, user.id, patch), user.email) });
});
