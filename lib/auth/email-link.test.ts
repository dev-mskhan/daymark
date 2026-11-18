import { describe, expect, it, vi } from 'vitest';
import { requestEmailSignIn } from './email-link';

describe('requestEmailSignIn', () => {
  it('uses the same non-enumerating email flow for existing and new users', async () => {
    const signInWithOtp = vi.fn(async () => ({
      data: { user: null, session: null },
      error: null,
    }));
    await requestEmailSignIn(
      { signInWithOtp },
      '  traveler@example.com  ',
      'https://daymark.example/auth/callback?next=%2Ftrips',
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'traveler@example.com',
      options: {
        emailRedirectTo: 'https://daymark.example/auth/callback?next=%2Ftrips',
        shouldCreateUser: true,
      },
    });
  });

  it('surfaces provider errors instead of showing a successful link message', async () => {
    const signInWithOtp = vi.fn(async () => {
      throw new Error('mail provider unavailable');
    });
    await expect(
      requestEmailSignIn({ signInWithOtp }, 'traveler@example.com', 'https://daymark.example/auth/callback'),
    ).rejects.toThrow('mail provider unavailable');
  });
});
