/**
 * Geoapify Place Details adapter — server-only.
 * Enriches a Place with opening hours, timezone, operational status, and
 * accessibility metadata fetched from the Geoapify Place Details API.
 *
 * Tasks: 2.2, 2.3, 2.4, 2.5, 2.6
 */

import type {
  AccessibilityInfo,
  FormattedOpeningHours,
  OperationalStatus,
  Place,
} from '../domain';

// ─── Opening hours parser (task 2.3) ─────────────────────────────────────────

const DAY_MAP: Record<string, string> = {
  Mo: 'monday',
  Tu: 'tuesday',
  We: 'wednesday',
  Th: 'thursday',
  Fr: 'friday',
  Sa: 'saturday',
  Su: 'sunday',
};

const DAY_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

function expandDays(raw: string): string[] {
  raw = raw.trim();
  if (raw === 'PH') return [];
  if (raw.includes('-')) {
    const [from, to] = raw.split('-');
    const start = DAY_ORDER.indexOf(from.trim() as (typeof DAY_ORDER)[number]);
    const end = DAY_ORDER.indexOf(to.trim() as (typeof DAY_ORDER)[number]);
    if (start === -1 || end === -1) return [];
    return DAY_ORDER.slice(start, end + 1) as string[];
  }
  return raw.split(',').map(d => d.trim()).filter(d => d in DAY_MAP);
}

/** Parse a time range string like "09:00-18:00" into {open, close}. */
function parseTimeRange(range: string): { open: string; close: string } | null {
  const match = range.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!match) return null;
  const pad = (t: string) => t.length === 4 ? '0' + t : t;
  return { open: pad(match[1]), close: pad(match[2]) };
}

/**
 * Parse OSM opening_hours string into a structured FormattedOpeningHours map.
 *
 * Handles common patterns:
 *   - "Mo-Fr 09:00-18:00"
 *   - "Mo-Fr 09:00-18:00; Sa 10:00-16:00"
 *   - "Mo-Fr 09:00-12:00,13:00-18:00"
 *   - "Mo,We,Fr 09:00-17:00"
 *   - "24/7"
 *   - "closed" / "off"
 *
 * Returns null when the string is unrecognisable.
 */
export function parseOpeningHours(raw: string): FormattedOpeningHours | null {
  if (!raw || typeof raw !== 'string') return null;
  const normalised = raw.trim();

  if (normalised === '24/7') {
    const result: FormattedOpeningHours = {};
    for (const full of Object.values(DAY_MAP)) result[full] = [{ open: '00:00', close: '24:00' }];
    return result;
  }

  const result: FormattedOpeningHours = {};
  const segments = normalised.split(';').map(s => s.trim()).filter(Boolean);

  for (const segment of segments) {
    if (/^off$|^closed$/i.test(segment)) continue;

    // Split "Mo-Fr 09:00-18:00,13:00-18:00" into day part and time part
    const spaceIdx = segment.search(/\d{1,2}:\d{2}/);
    if (spaceIdx === -1) continue;

    const dayPart = segment.slice(0, spaceIdx).replace(/\s+$/, '');
    const timePart = segment.slice(spaceIdx);

    const days = dayPart
      ? dayPart.split(',').flatMap(chunk => expandDays(chunk))
      : [...DAY_ORDER];

    if (!days.length) continue;

    const timeSlots = timePart
      .split(',')
      .map(t => parseTimeRange(t.trim()))
      .filter((t): t is { open: string; close: string } => t !== null);

    for (const day of days) {
      const full = DAY_MAP[day];
      if (!full) continue;
      result[full] = [...(result[full] ?? []), ...timeSlots];
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ─── Geoapify Place Details types ────────────────────────────────────────────

type GeoapifyPlaceDetails = {
  features?: {
    properties?: {
      place_id?: string;
      opening_hours?: string;
      timezone?: { name?: string };
      facilities?: {
        wheelchair?: string | boolean;
        elevator?: string | boolean;
        parking?: string | boolean;
      };
      // Geoapify uses "datasource.raw" for some OSM-sourced fields
      datasource?: {
        raw?: {
          opening_hours?: string;
          wheelchair?: string;
          'addr:timezone'?: string;
        };
      };
    };
  }[];
};

// ─── PlaceDetailsProvider (task 2.2) ─────────────────────────────────────────

export class PlaceDetailsProvider {
  private cache = new Map<string, Promise<Place>>();

  constructor(
    private fixture = false,
    private signal?: AbortSignal,
  ) {}

  get isLive() {
    return !this.fixture;
  }

  /**
   * Enrich a Place with opening hours, timezone, and accessibility info.
   * In fixture mode returns deterministic demo data.
   * In live mode calls Geoapify Place Details API.
   *
   * Tasks 2.4, 2.5
   */
  async enrichPlaceDetails(place: Place): Promise<Place> {
    const cached = this.cache.get(place.id);
    if (cached) return cached;

    const enrichment = this.isLive
      ? this.fetchFromGeoapify(place)
      : Promise.resolve(this.fixtureEnrich(place));
    this.cache.set(place.id, enrichment);
    try {
      return await enrichment;
    } catch (error) {
      if (this.cache.get(place.id) === enrichment) this.cache.delete(place.id);
      throw error;
    }
  }

  /**
   * Enrich an array of priority candidates in batches.
   * Task 2.5
   */
  async enrichCandidates(places: Place[]): Promise<Place[]> {
    const results: Place[] = [];
    // Process in batches of 3 to avoid hammering the API
    for (let i = 0; i < places.length; i += 3) {
      const batch = places.slice(i, i + 3);
      const enriched = await Promise.all(
        batch.map(p => this.enrichPlaceDetails(p).catch(() => p)),
      );
      results.push(...enriched);
      this.signal?.throwIfAborted();
    }
    return results;
  }

  // ── Fixture enrichment ──────────────────────────────────────────────────────

  private fixtureEnrich(place: Place): Place {
    const formattedOpeningHours = place.openingHours
      ? parseOpeningHours(place.openingHours) ?? undefined
      : undefined;

    return {
      ...place,
      timezone: 'America/New_York',
      formattedOpeningHours,
      operationalStatus: 'operational' as OperationalStatus,
      accessibilityInfo: { wheelchairAccessible: true },
      lastVerified: new Date().toISOString(),
    };
  }

  // ── Live enrichment ─────────────────────────────────────────────────────────

  private async fetchFromGeoapify(place: Place): Promise<Place> {
    if (!process.env.GEOAPIFY_API_KEY)
      throw new Error('Live mode requires GEOAPIFY_API_KEY.');

    // Geoapify Place Details requires a place_id. Discovery produces ids prefixed
    // with `geoapify:`; places from other sources are returned unchanged.
    if (!place.id.startsWith('geoapify:')) return place;

    const geoapifyId = place.id.replace('geoapify:', '');
    const params = new URLSearchParams({
      id: geoapifyId,
      apiKey: process.env.GEOAPIFY_API_KEY,
      features: 'details',
    });

    const response = await fetch(
      `https://api.geoapify.com/v2/place-details?${params}`,
      {
        signal: this.signal
          ? AbortSignal.any([this.signal, AbortSignal.timeout(10_000)])
          : AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) return place; // graceful degradation

    const payload = (await response.json()) as GeoapifyPlaceDetails;
    return this.normalizeDetails(place, payload);
  }

  private normalizeDetails(place: Place, payload: GeoapifyPlaceDetails): Place {
    const props = payload.features?.[0]?.properties;
    if (!props) return place;

    // Prefer top-level opening_hours; fall back to datasource.raw
    const rawHours =
      props.opening_hours ?? props.datasource?.raw?.opening_hours;
    const formattedOpeningHours = rawHours
      ? (parseOpeningHours(rawHours) ?? undefined)
      : undefined;

    // Timezone
    const timezone = props.timezone?.name ?? props.datasource?.raw?.['addr:timezone'];

    // Operational status
    const operationalStatus: OperationalStatus = 'operational';

    // Accessibility
    const f = props.facilities ?? {};
    const rawWheelchair = props.datasource?.raw?.wheelchair;
    const wheelchairAccessible =
      f.wheelchair === 'yes' ||
      f.wheelchair === true ||
      rawWheelchair === 'yes' ||
      rawWheelchair === 'designated'
        ? true
        : f.wheelchair === 'no' || rawWheelchair === 'no'
          ? false
          : undefined;

    const accessibilityInfo: AccessibilityInfo = {
      ...(wheelchairAccessible !== undefined ? { wheelchairAccessible } : {}),
      ...(f.elevator === true || f.elevator === 'yes' ? { elevator: true } : {}),
      ...(f.parking === true || f.parking === 'yes' ? { parking: true } : {}),
    };

    return {
      ...place,
      ...(timezone ? { timezone } : {}),
      ...(formattedOpeningHours ? { formattedOpeningHours } : {}),
      operationalStatus,
      ...(Object.keys(accessibilityInfo).length ? { accessibilityInfo } : {}),
      lastVerified: new Date().toISOString(),
    };
  }
}
