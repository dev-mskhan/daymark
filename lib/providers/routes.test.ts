import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutesProvider } from './routes';
import type { Place } from '../domain';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const place = (id: string, latitude: number, longitude: number): Place => ({
  id, name: id, address: '', latitude, longitude, types: [], source: 'geoapify',
});
const from = place('geoapify:a', 40.7506, -73.9935);
const to = place('geoapify:b', 40.7484, -73.9857);
const routeResponse = (properties: unknown) => Response.json({ features: [{ properties }] });

describe('RoutesProvider (Geoapify)', () => {
  it('calculates walking time from the routing response', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      return url.includes('mode=walk') ? routeResponse({ time: 610, distance: 820 }) : routeResponse({});
    });
    const options = await new RoutesProvider(false).options(from, to);
    expect(options).toEqual([expect.objectContaining({ mode: 'walk', durationMinutes: 10, walkingMinutes: 10, distanceMeters: 820 })]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('waypoints=40.7506%2C-73.9935%7C40.7484%2C-73.9857'), expect.any(Object));
  });

  it('adds transit only when a walking breakdown is available', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input).includes('mode=walk')
        ? routeResponse({ time: 1500, distance: 1800 })
        : routeResponse({ time: 900, distance: 2100, legs: [{ steps: [{ mode: 'walk', time: 240 }, { mode: 'subway', time: 600, transit: { short_name: 'N' } }, { mode: 'walk', time: 60 }] }] }),
    );
    const options = await new RoutesProvider(false).options(from, to);
    expect(options[0]).toMatchObject({ mode: 'transit', durationMinutes: 15, walkingMinutes: 5, transfers: 0, lines: ['N'] });
    expect(options[1]).toMatchObject({ mode: 'walk', durationMinutes: 25 });
  });

  it('keeps walking when transit routing fails or lacks detail', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input).includes('mode=walk') ? routeResponse({ time: 600, distance: 800 }) : new Response('', { status: 400 }),
    );
    const options = await new RoutesProvider(false).options(from, to);
    expect(options.map(option => option.mode)).toEqual(['walk']);
  });

  it('surfaces a walking-route failure', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    await expect(new RoutesProvider(false).options(from, to)).rejects.toThrow('Geoapify request failed (500)');
  });
});
