import { describe, expect, it, vi, afterEach } from 'vitest';
import { PlacesProvider } from './places';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('PlacesProvider geocoding', () => {
  it('returns fixture coordinates in fixture mode', async () => {
    const provider = new PlacesProvider(true);
    const result = await provider.geocode('Penn Station, New York City');
    expect(result).toMatchObject({
      latitude: 40.7506,
      longitude: -73.9935,
      formattedAddress: 'Penn Station, New York City',
      confidence: 'high',
    });
  });

  it('calls Geoapify API in live mode with valid address', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [
          {
            properties: {
              lat: 40.7506,
              lon: -73.9935,
              formatted: 'Pennsylvania Station, New York, NY, USA',
              rank: { confidence: 0.95 },
            },
          },
        ],
      }),
    );

    const provider = new PlacesProvider(false);
    const result = await provider.geocode('Penn Station, New York');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.geoapify.com/v1/geocode/search'),
      expect.any(Object),
    );
    expect(result).toMatchObject({
      latitude: 40.7506,
      longitude: -73.9935,
      formattedAddress: 'Pennsylvania Station, New York, NY, USA',
      confidence: 'high',
    });

    vi.unstubAllEnvs();
  });

  it('assigns medium confidence for lower confidence scores', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [
          {
            properties: {
              lat: 40.7506,
              lon: -73.9935,
              formatted: 'Penn Station area',
              rank: { confidence: 0.6 },
            },
          },
        ],
      }),
    );

    const provider = new PlacesProvider(false);
    const result = await provider.geocode('Penn Station area');

    expect(result.confidence).toBe('medium');
    vi.unstubAllEnvs();
  });

  it('assigns low confidence for low confidence scores', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [
          {
            properties: {
              lat: 40.7506,
              lon: -73.9935,
              formatted: 'Somewhere near Penn Station',
              rank: { confidence: 0.3 },
            },
          },
        ],
      }),
    );

    const provider = new PlacesProvider(false);
    const result = await provider.geocode('vague location');

    expect(result.confidence).toBe('low');
    vi.unstubAllEnvs();
  });

  it('throws error when no results returned', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ features: [] }),
    );

    const provider = new PlacesProvider(false);

    await expect(provider.geocode('nonexistent address')).rejects.toThrow(
      'Could not geocode',
    );
    vi.unstubAllEnvs();
  });

  it('throws error when API returns invalid coordinates', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [{ properties: { formatted: 'Invalid' } }],
      }),
    );

    const provider = new PlacesProvider(false);

    await expect(provider.geocode('invalid')).rejects.toThrow(
      'Could not geocode',
    );
    vi.unstubAllEnvs();
  });

  it('throws error when API request fails', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    const provider = new PlacesProvider(false);

    await expect(provider.geocode('test')).rejects.toThrow('Geoapify request failed (500)');
    vi.unstubAllEnvs();
  });

  it('accepts valid coordinates on the equator and prime meridian', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [{ properties: { lat: 0, lon: 0, formatted: 'Null Island' } }],
      }),
    );

    await expect(new PlacesProvider(false).geocode('Null Island')).resolves.toMatchObject({
      latitude: 0,
      longitude: 0,
      formattedAddress: 'Null Island',
    });
    vi.unstubAllEnvs();
  });

  it('requires GEOAPIFY_API_KEY in live mode', async () => {
    const provider = new PlacesProvider(false);
    await expect(provider.geocode('test')).rejects.toThrow(
      'GEOAPIFY_API_KEY',
    );
  });
});

describe('PlacesProvider discovery (Geoapify)', () => {
  const feature = (n: number, extra: Record<string, unknown> = {}) => ({
    properties: {
      place_id: `pid-${n}`,
      name: `Place ${n}`,
      formatted: `${n} Main St, New York, NY`,
      lat: 40.7 + n / 1000,
      lon: -73.9 - n / 1000,
      categories: ['tourism.sights'],
      ...extra,
    },
  });
  const geocodeBody = { features: [{ properties: { lat: 40.7128, lon: -74.006, formatted: 'New York, NY, USA', rank: { confidence: 0.95 } } }] };

  it('normalizes Geoapify places into candidates', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input).includes('/v1/geocode/')
        ? Response.json(geocodeBody)
        : Response.json({ features: [feature(1, { opening_hours: 'Mo-Su 09:00-17:00' }), feature(2), feature(3), { properties: { name: 'No id' } }] }),
    );
    const places = await new PlacesProvider(false).discover('New York City', ['iconic']);
    expect(places).toHaveLength(3);
    expect(places[0]).toMatchObject({ id: 'geoapify:pid-1', name: 'Place 1', source: 'geoapify', openingHours: 'Mo-Su 09:00-17:00' });
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('categories=tourism.sights'), expect.any(Object));
  });

  it('continues when one category fails', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/v1/geocode/')) return Response.json(geocodeBody);
      return url.includes('leisure.park') ? new Response('', { status: 400 }) : Response.json({ features: [feature(1), feature(2), feature(3)] });
    });
    const places = await new PlacesProvider(false).discover('New York City', ['iconic', 'nature']);
    expect(places.length).toBeGreaterThanOrEqual(3);
  });

  it('explains when too few places are found', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input).includes('/v1/geocode/') ? Response.json(geocodeBody) : Response.json({ features: [feature(1)] }),
    );
    await expect(new PlacesProvider(false).discover('New York City', ['iconic'])).rejects.toThrow('could not find enough places');
  });

  it('surfaces malformed provider responses', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input =>
      String(input).includes('/v1/geocode/') ? Response.json(geocodeBody) : Response.json({ unexpected: true }),
    );
    await expect(new PlacesProvider(false).discover('New York City', ['iconic'])).rejects.toThrow('malformed');
  });
});
