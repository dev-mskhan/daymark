import { describe, expect, it, vi, afterEach } from 'vitest';
import { PlacesProvider } from './places';

afterEach(() => vi.restoreAllMocks());

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

    await expect(provider.geocode('test')).rejects.toThrow('Geocoding failed');
    vi.unstubAllEnvs();
  });

  it('requires GEOAPIFY_API_KEY in live mode', async () => {
    const provider = new PlacesProvider(false);
    await expect(provider.geocode('test')).rejects.toThrow(
      'GEOAPIFY_API_KEY',
    );
  });
});
