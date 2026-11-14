/**
 * Shared Geoapify HTTP client — server-only.
 * Adds the API key, a default 10s timeout, caller abort support, bounded retry
 * with backoff on quota/availability errors, and normalized provider errors.
 */

const BASE_URL = 'https://api.geoapify.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRY_DELAY_MS = 5_000;

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly kind: 'config' | 'http' | 'timeout' | 'malformed' = 'http',
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface GeoapifyRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

export async function geoapifyJson<T>(
  path: string,
  params: Record<string, string>,
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 2 }: GeoapifyRequestOptions = {},
): Promise<T> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) throw new ProviderError('Live mode requires GEOAPIFY_API_KEY.', undefined, 'config');
  const url = `${BASE_URL}${path}?${new URLSearchParams({ ...params, apiKey })}`;

  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new ProviderError('Geoapify request timed out.', undefined, 'timeout');
      }
      throw new ProviderError('Geoapify could not be reached.', undefined, 'http');
    }
    if ((response.status === 429 || response.status === 503) && attempt < retries) {
      await sleep(retryDelayMs(response, attempt), signal);
      continue;
    }
    if (!response.ok) {
      throw new ProviderError(
        response.status === 429
          ? 'Geoapify rate limit reached. Please try again shortly.'
          : `Geoapify request failed (${response.status}).`,
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ProviderError('Geoapify returned a malformed response.', response.status, 'malformed');
    }
  }
}
