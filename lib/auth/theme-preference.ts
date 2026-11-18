import { apiFetch } from '@/lib/api/client';

export type ThemePreference = 'system' | 'light' | 'dark';

export async function syncThemePreference(
  localPreference: ThemePreference,
  request: typeof apiFetch = apiFetch,
): Promise<ThemePreference> {
  const response = await request('/api/profile');
  const saved = (await response.json()).profile?.themePreference;
  if (saved !== 'system' && saved !== 'light' && saved !== 'dark')
    throw new Error('The account returned an invalid theme preference.');
  if (saved === 'system' && localPreference !== 'system') {
    await request('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ themePreference: localPreference }),
    });
    return localPreference;
  }
  return saved;
}
