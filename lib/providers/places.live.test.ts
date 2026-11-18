import { describe, expect, it } from 'vitest';
import { PlacesProvider } from './places';

const live = process.env.GEOAPIFY_LIVE_TESTS === '1';

describe.skipIf(!live)('PlacesProvider live Geoapify integration', () => {
  const provider = () => new PlacesProvider(false, AbortSignal.timeout(45_000));

  it.each([
    {
      label: 'New York',
      address: 'Penn Station, New York, NY',
      latitude: [40, 41],
      longitude: [-75, -73],
    },
    {
      label: 'Los Angeles',
      address: 'Union Station, Los Angeles, CA',
      latitude: [33, 35],
      longitude: [-119, -117],
    },
    {
      label: 'Chicago',
      address: 'Union Station, Chicago, IL',
      latitude: [41, 42],
      longitude: [-88, -87],
    },
  ])('geocodes a real $label address into the expected region', async ({ address, latitude, longitude }) => {
    const result = await provider().geocode(address);
    expect(result.formattedAddress.trim()).not.toBe('');
    expect(result.latitude).toBeGreaterThan(latitude[0]);
    expect(result.latitude).toBeLessThan(latitude[1]);
    expect(result.longitude).toBeGreaterThan(longitude[0]);
    expect(result.longitude).toBeLessThan(longitude[1]);
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  }, 45_000);

  it.each([
    'New York City',
    'Los Angeles, California',
    'Chicago, Illinois',
  ])('discovers normalized Geoapify places in %s', async (city) => {
    const places = await provider().discover(city, ['iconic']);
    expect(places.length).toBeGreaterThanOrEqual(3);
    expect(places.every(place => place.source === 'geoapify')).toBe(true);
    expect(places.every(place =>
      Number.isFinite(place.latitude) && Number.isFinite(place.longitude),
    )).toBe(true);
    expect(new Set(places.map(place => place.id)).size).toBe(places.length);
  }, 45_000);
});
