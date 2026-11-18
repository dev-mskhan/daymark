import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Place } from '@/lib/domain';
import { ApiError } from '@/lib/api/errors';
import { authed, parseBody } from '@/lib/api/handler';
import { GeocodingNotFoundError, PlacesProvider, type GeocodedLocation } from '@/lib/providers/places';
import { ProviderError } from '@/lib/providers/geoapify';

export const runtime = 'nodejs';

const requestSchema = z.object({
  query: z.string().trim().min(2).max(400),
}).strict();

export const POST = authed(async ({ request }) => {
  const { query } = await parseBody(request, requestSchema);
  let location: GeocodedLocation;
  try {
    location = await new PlacesProvider(false).geocode(query);
  } catch (error) {
    if (error instanceof GeocodingNotFoundError)
      throw new ApiError('invalid_request', error.message);
    if (error instanceof ProviderError)
      throw new ApiError('unavailable', 'Geoapify could not verify this location. Try again shortly.');
    throw error;
  }
  if (location.confidence === 'low')
    throw new ApiError('invalid_request', 'Could not confidently locate this overnight stop. Add a more specific address.');

  const place: Place = {
    id: `geoapify:overnight:${randomUUID()}`,
    name: query,
    address: location.formattedAddress,
    latitude: location.latitude,
    longitude: location.longitude,
    types: [],
    source: 'geoapify',
  };
  return Response.json({ place, confidence: location.confidence });
});
