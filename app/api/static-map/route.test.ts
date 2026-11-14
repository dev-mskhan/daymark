import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const request = (query: string) => new Request(`http://localhost/api/static-map?${query}`);

describe('static map proxy', () => {
  it('rejects invalid coordinates and oversized requests', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'secret-key');
    expect((await GET(request('points=999,10'))).status).toBe(400);
    expect((await GET(request('points=abc'))).status).toBe(400);
    const tooMany = Array.from({ length: 13 }, (_, i) => `-73.9,40.${i}`).join('|');
    expect((await GET(request(`points=${tooMany}`))).status).toBe(400);
  });

  it('reports a missing key without calling the provider', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    expect((await GET(request('points=-73.9,40.7'))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('proxies the themed map image and never echoes the key', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'secret-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('png', { headers: { 'content-type': 'image/png' } }));
    const response = await GET(request('points=-73.99,40.75|-73.98,40.76&theme=dark'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(String(fetchMock.mock.calls[0][0])).toContain('style=dark-matter');
    expect(JSON.stringify([...response.headers])).not.toContain('secret-key');
  });

  it('maps provider failures to 502', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'secret-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 403 }));
    expect((await GET(request('points=-73.99,40.75'))).status).toBe(502);
  });
});
