import { afterEach, describe, expect, it, vi } from 'vitest';
import { geoapifyJson, ProviderError } from './geoapify';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('geoapifyJson', () => {
  it('requires GEOAPIFY_API_KEY without calling the network', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(geoapifyJson('/v1/test', {})).rejects.toMatchObject({ kind: 'config' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retries quota errors with backoff and then succeeds', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const result = geoapifyJson<{ ok: boolean }>('/v1/test', {});
    await vi.advanceTimersByTimeAsync(600);
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a rate-limit error after retries are exhausted', async () => {
    vi.useFakeTimers();
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { status: 429 }));
    const result = geoapifyJson('/v1/test', {}, { retries: 1 });
    const assertion = expect(result).rejects.toMatchObject({ status: 429, message: expect.stringContaining('rate limit') });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  it('does not retry other HTTP errors', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
    await expect(geoapifyJson('/v1/test', {})).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes malformed JSON responses', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>', { status: 200 }));
    await expect(geoapifyJson('/v1/test', {})).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('normalizes timeouts', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(geoapifyJson('/v1/test', {})).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('propagates caller aborts instead of wrapping them', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const controller = new AbortController();
    controller.abort();
    const error = await geoapifyJson('/v1/test', {}, { signal: controller.signal }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ProviderError);
  });
});
