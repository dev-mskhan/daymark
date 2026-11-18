import type { ExperienceType, Place } from "../domain";
import { geoapifyJson, ProviderError } from "./geoapify";

// Geoapify Places categories per experience lens.
const SEARCH_CATEGORIES: Record<ExperienceType, string[]> = {
  iconic: ["tourism.sights"],
  history: ["entertainment.museum", "heritage"],
  local_life: ["commercial.marketplace", "commercial.books"],
  art: ["entertainment.culture.gallery", "entertainment.culture.arts_centre"],
  nature: ["leisure.park"],
  food: ["catering.restaurant"],
  architecture: ["building.historic"],
};
const SEARCH_RADIUS_METERS = 15_000;
const RESULTS_PER_LENS = 8;

type GeoapifyPlaceFeature = {
  properties?: {
    place_id?: string;
    name?: string;
    formatted?: string;
    address_line2?: string;
    lat?: number;
    lon?: number;
    categories?: string[];
    opening_hours?: string;
    datasource?: { raw?: { opening_hours?: string } };
  };
};

export interface GeocodedLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  confidence: 'high' | 'medium' | 'low';
}

export class GeocodingNotFoundError extends Error {
  constructor(address: string) {
    super(`Could not geocode "${address}". Please check the address and try again.`);
    this.name = 'GeocodingNotFoundError';
  }
}

export class PlacesProvider {
  constructor(
    private fixture = false,
    private signal?: AbortSignal,
  ) {}
  get isLive() {
    return !this.fixture;
  }

  async geocode(address: string): Promise<GeocodedLocation> {
    if (!this.isLive) {
      // Fixture mode: Penn Station, New York City
      return {
        latitude: 40.7494,
        longitude: -73.9921,
        formattedAddress: 'Penn Station, New York City',
        confidence: 'high',
      };
    }
    const payload = await geoapifyJson<{
      features?: {
        properties?: {
          lat?: number;
          lon?: number;
          formatted?: string;
          rank?: { confidence?: number };
        };
      }[];
    }>('/v1/geocode/search', { text: address, limit: '1' }, { signal: this.signal, timeoutMs: 15_000 });
    const feature = payload.features?.[0];
    const props = feature?.properties;
    if (
      typeof props?.lat !== 'number' ||
      typeof props.lon !== 'number' ||
      !Number.isFinite(props.lat) ||
      !Number.isFinite(props.lon)
    ) {
      throw new GeocodingNotFoundError(address);
    }
    const confidenceScore = props.rank?.confidence ?? 0;
    const confidence: GeocodedLocation['confidence'] =
      confidenceScore >= 0.8 ? 'high' : confidenceScore >= 0.5 ? 'medium' : 'low';
    return {
      latitude: props.lat,
      longitude: props.lon,
      formattedAddress: props.formatted ?? address,
      confidence,
    };
  }

  async discover(
    destination: string,
    lenses: ExperienceType[],
  ): Promise<Place[]> {
    if (!this.isLive) return demoPlaces(destination);
    const center = await this.geocode(destination);
    const groups: Place[][] = [];
    let lastError: unknown;
    for (const categories of [
      ...new Set(lenses.flatMap((lens) => SEARCH_CATEGORIES[lens])),
    ]) {
      try {
        groups.push(await this.search(categories, center));
      } catch (error) {
        this.signal?.throwIfAborted();
        // A failed category should not discard results from the others.
        lastError = error;
      }
    }
    const interleaved = Array.from(
      { length: Math.max(0, ...groups.map((group) => group.length)) },
      (_, index) =>
        groups.flatMap((group) => (group[index] ? [group[index]] : [])),
    ).flat();
    const places = deduplicate(interleaved).slice(0, 30);
    if (places.length < 3) {
      if (lastError instanceof ProviderError && lastError.kind !== "http")
        throw lastError;
      throw new Error(
        `We could not find enough places in ${destination}. Try a larger US city or a more specific area.`,
      );
    }
    return places;
  }

  private async search(
    categories: string,
    center: GeocodedLocation,
  ): Promise<Place[]> {
    const payload = await geoapifyJson<{ features?: GeoapifyPlaceFeature[] }>(
      "/v2/places",
      {
        categories,
        filter: `circle:${center.longitude},${center.latitude},${SEARCH_RADIUS_METERS}`,
        bias: `proximity:${center.longitude},${center.latitude}`,
        limit: String(RESULTS_PER_LENS),
        lang: "en",
      },
      { signal: this.signal },
    );
    if (!Array.isArray(payload.features))
      throw new ProviderError(
        "Geoapify returned a malformed response.",
        undefined,
        "malformed",
      );
    return payload.features.flatMap((feature) => {
      const props = feature.properties;
      if (
        !props?.place_id ||
        !props.name ||
        !Number.isFinite(props.lat) ||
        !Number.isFinite(props.lon)
      )
        return [];
      const openingHours =
        props.opening_hours ?? props.datasource?.raw?.opening_hours;
      return [
        {
          id: `geoapify:${props.place_id}`,
          name: props.name,
          address: props.formatted ?? props.address_line2 ?? "",
          latitude: props.lat!,
          longitude: props.lon!,
          types: props.categories ?? [],
          source: "geoapify" as const,
          ...(openingHours ? { openingHours } : {}),
        },
      ];
    });
  }
}
function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = (lat2 - lat1) * 111;
  const x = (lon2 - lon1) * 111 * Math.cos((lat1 * Math.PI) / 180);
  return Math.hypot(x, y);
}
function deduplicate(places: Place[]) {
  const kept: Place[] = [];
  for (const place of places) {
    if (
      kept.some(
        (existing) =>
          existing.id === place.id ||
          (distanceKm(
            existing.latitude,
            existing.longitude,
            place.latitude,
            place.longitude,
          ) < 0.6 &&
            (existing.name === place.name ||
              existing.name.startsWith(place.name) ||
              place.name.startsWith(existing.name))),
      )
    )
      continue;
    kept.push(place);
  }
  return kept;
}
function demoPlaces(destination: string): Place[] {
  const places: [string, number, number, string[], string?][] = [
    ['The Metropolitan Museum of Art',   40.7794, -73.9632, ['museum', 'art'],                'Mo-Tu,Th-Su 10:00-17:00; Fr-Sa 10:00-21:00; We closed'],
    ['Central Park',                     40.7851, -73.9683, ['park', 'nature'],               '24/7'],
    ['Chelsea Gallery Row',              40.7484, -74.0048, ['art_gallery', 'art']],
    ['Chelsea Market',                   40.7424, -74.0060, ['market', 'food'],               'Mo-Sa 07:00-21:00; Su 08:00-20:00'],
    ['The High Line',                    40.7480, -74.0048, ['park', 'architecture'],          '07:00-22:00'],
    ['Washington Square Park',           40.7308, -73.9973, ['park', 'local_life'],           '24/7'],
    ['Greenwich Village Restaurant',     40.7282, -74.0028, ['restaurant', 'food'],           'Mo-Su 11:30-22:00'],
    ['Empire State Building',            40.7484, -73.9967, ['landmark', 'architecture'],     'Mo-Su 09:00-23:00'],
  ];
  return places.map(([name, latitude, longitude, types, openingHoursRaw], index) => ({
    id: `demo-${index}`,
    name,
    address: `${name}, ${destination}`,
    latitude,
    longitude,
    types: [...types],
    rating: 4.1 + (index % 4) * 0.2,
    source: 'demo' as const,
    ...(openingHoursRaw ? { openingHours: openingHoursRaw } : {}),
    timezone: 'America/New_York',
    operationalStatus: 'operational' as const,
    lastVerified: '2026-01-01T00:00:00Z',
    accessibilityInfo: { wheelchairAccessible: index % 3 !== 2 },
  }));
}
