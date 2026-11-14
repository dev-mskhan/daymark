import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeNextPath } from '@/lib/auth/redirect';

describe('safeNextPath', () => {
  it('allows same-site relative paths', () => {
    expect(safeNextPath('/trips')).toBe('/trips');
    expect(safeNextPath('/trips/abc?x=1')).toBe('/trips/abc?x=1');
  });

  it('rejects absolute, protocol-relative and malformed redirects', () => {
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'trips', '/ok\r\nSet-Cookie: a=b', '', null, undefined])
      expect(safeNextPath(value as string | null | undefined, '/fallback')).toBe('/fallback');
  });
});

const exchange = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: exchange, signOut: vi.fn() } }) }));

describe('auth callback and sign-out routes', () => {
  afterEach(() => { vi.unstubAllEnvs(); exchange.mockReset(); });

  it('exchanges the code and redirects only to a safe path', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk');
    exchange.mockResolvedValue({ error: null });
    const { GET } = await import('./callback/route');
    const ok = await GET(new Request('http://localhost/auth/callback?code=abc&next=/trips'));
    expect(ok.headers.get('location')).toBe('http://localhost/trips');
    const hostile = await GET(new Request('http://localhost/auth/callback?code=abc&next=//evil.example'));
    expect(hostile.headers.get('location')).toBe('http://localhost/trips');
  });

  it('sends users back to sign-in when the exchange fails or the code is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'pk');
    exchange.mockResolvedValue({ error: new Error('bad code') });
    const { GET } = await import('./callback/route');
    expect((await GET(new Request('http://localhost/auth/callback?code=bad'))).headers.get('location')).toContain('/sign-in?error=callback');
    expect((await GET(new Request('http://localhost/auth/callback'))).headers.get('location')).toContain('/sign-in?error=callback');
  });

  it('refuses cross-origin sign-out requests', async () => {
    const { POST } = await import('./signout/route');
    expect((await POST(new Request('http://localhost/auth/signout', { method: 'POST', headers: { origin: 'https://evil.example' } }))).status).toBe(403);
    const ok = await POST(new Request('http://localhost/auth/signout', { method: 'POST', headers: { origin: 'http://localhost' } }));
    expect(ok.status).toBe(303);
  });
});
