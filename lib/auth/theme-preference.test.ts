import { describe, expect, it, vi } from 'vitest';
import { syncThemePreference } from './theme-preference';

describe('syncThemePreference', () => {
  it('uses the account preference when one is already saved', async () => {
    const request = vi.fn(async () => Response.json({ profile: { themePreference: 'dark' } }));
    await expect(syncThemePreference('light', request)).resolves.toBe('dark');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('keeps and persists the device choice when the profile is still on system', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ profile: { themePreference: 'system' } }))
      .mockResolvedValueOnce(Response.json({ profile: { themePreference: 'light' } }));
    await expect(syncThemePreference('light', request)).resolves.toBe('light');
    expect(request).toHaveBeenNthCalledWith(2, '/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ themePreference: 'light' }),
    }));
  });

  it('rejects invalid profile values and propagates profile request failures', async () => {
    await expect(syncThemePreference('system', async () =>
      Response.json({ profile: { themePreference: 'purple' } }),
    )).rejects.toThrow('invalid theme preference');
    await expect(syncThemePreference('system', async () => {
      throw new Error('profile unavailable');
    })).rejects.toThrow('profile unavailable');
  });
});
