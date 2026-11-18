/**
 * Tests for Priority 2: Provider-Sourced Verification
 * Tasks 2.11 (opening hours parsing) and 2.12 (timezone validation)
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { PlaceDetailsProvider, parseOpeningHours } from './place-details';
import { PlacesProvider } from './places';
import { extractTimezone, buildCaveatNotice } from '../planning-context';
import type { Activity, Place, Snapshot } from '../domain';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('PlaceDetailsProvider cache', () => {
  it('deduplicates concurrent enrichment requests for the same place', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      features: [{ properties: { opening_hours: 'Mo-Fr 09:00-18:00', timezone: { name: 'America/New_York' } } }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new PlaceDetailsProvider(false);
    const place: Place = {
      id: 'geoapify:place-1',
      name: 'Test Museum',
      address: 'New York',
      latitude: 40.75,
      longitude: -73.99,
      types: ['museum'],
      source: 'geoapify',
    };

    const enriched = await provider.enrichCandidates([place, { ...place }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(enriched).toHaveLength(2);
    expect(enriched[0].timezone).toBe('America/New_York');
    expect(enriched[1].formattedOpeningHours?.monday).toEqual([{ open: '09:00', close: '18:00' }]);
  });

  it('retries enrichment after a failed request instead of caching the failure', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(Response.json({
        features: [{ properties: { timezone: { name: 'America/New_York' } } }],
      }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new PlaceDetailsProvider(false);
    const place: Place = {
      id: 'geoapify:place-2',
      name: 'Test Gallery',
      address: 'New York',
      latitude: 40.75,
      longitude: -73.99,
      types: ['museum'],
      source: 'geoapify',
    };

    await expect(provider.enrichCandidates([place])).resolves.toEqual([place]);
    const retried = await provider.enrichPlaceDetails(place);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(retried.timezone).toBe('America/New_York');
  });
});

describe('fixture place enrichment', () => {
  it('uses the demo opening-hours data and leaves missing hours unverified', async () => {
    const places = await new PlacesProvider(true).discover('New York City', []);
    const enriched = await new PlaceDetailsProvider(true).enrichCandidates(places);
    const market = enriched.find(place => place.id === 'demo-3');
    const highLine = enriched.find(place => place.id === 'demo-4');
    const gallery = enriched.find(place => place.id === 'demo-2');

    expect(market?.formattedOpeningHours?.wednesday).toEqual([{ open: '07:00', close: '21:00' }]);
    expect(highLine?.formattedOpeningHours?.sunday).toEqual([{ open: '07:00', close: '22:00' }]);
    expect(gallery?.formattedOpeningHours).toBeUndefined();
  });
});

// ─── Task 2.11: Opening hours parsing tests ───────────────────────────────────

describe('parseOpeningHours', () => {
  it('parses a simple weekday range', () => {
    const result = parseOpeningHours('Mo-Fr 09:00-18:00');
    expect(result).not.toBeNull();
    expect(result!.monday).toEqual([{ open: '09:00', close: '18:00' }]);
    expect(result!.friday).toEqual([{ open: '09:00', close: '18:00' }]);
    // Saturday excluded
    expect(result!.saturday).toBeUndefined();
  });

  it('parses multiple segments separated by semicolons', () => {
    const result = parseOpeningHours('Mo-Fr 09:00-18:00; Sa 10:00-16:00');
    expect(result).not.toBeNull();
    expect(result!.monday).toEqual([{ open: '09:00', close: '18:00' }]);
    expect(result!.saturday).toEqual([{ open: '10:00', close: '16:00' }]);
    expect(result!.sunday).toBeUndefined();
  });

  it('parses 24/7', () => {
    const result = parseOpeningHours('24/7');
    expect(result).not.toBeNull();
    expect(result!.monday).toEqual([{ open: '00:00', close: '24:00' }]);
    expect(result!.sunday).toEqual([{ open: '00:00', close: '24:00' }]);
    expect(Object.keys(result!)).toHaveLength(7);
  });

  it('applies time-only rules to every day of the week', () => {
    const result = parseOpeningHours('07:00-22:00');
    expect(result).not.toBeNull();
    expect(Object.values(result!)).toHaveLength(7);
    expect(result!.sunday).toEqual([{ open: '07:00', close: '22:00' }]);
  });

  it('parses a complex Metro Museum format with closed day', () => {
    // Mo-Tu,Th-Su 10:00-17:00; Fr-Sa 10:00-21:00; We closed
    const result = parseOpeningHours('Mo-Tu,Th-Su 10:00-17:00; Fr-Sa 10:00-21:00; We closed');
    expect(result).not.toBeNull();
    expect(result!.monday).toEqual([{ open: '10:00', close: '17:00' }]);
    expect(result!.tuesday).toEqual([{ open: '10:00', close: '17:00' }]);
    // Wednesday should not be present (closed)
    expect(result!.wednesday).toBeUndefined();
    // Friday appears in first segment (Th-Su) AND second (Fr-Sa)
    // Both slots should be included
    expect(result!.friday?.length).toBeGreaterThanOrEqual(1);
  });

  it('parses comma-separated days', () => {
    const result = parseOpeningHours('Mo,We,Fr 09:00-17:00');
    expect(result).not.toBeNull();
    expect(result!.monday).toEqual([{ open: '09:00', close: '17:00' }]);
    expect(result!.wednesday).toEqual([{ open: '09:00', close: '17:00' }]);
    expect(result!.friday).toEqual([{ open: '09:00', close: '17:00' }]);
    expect(result!.tuesday).toBeUndefined();
  });

  it('handles single-hour times with zero-padding', () => {
    const result = parseOpeningHours('Mo-Fr 9:00-18:00');
    expect(result).not.toBeNull();
    expect(result!.monday?.[0].open).toBe('09:00');
  });

  it('returns null for empty string', () => {
    expect(parseOpeningHours('')).toBeNull();
  });

  it('returns null for a completely unrecognisable string', () => {
    expect(parseOpeningHours('call ahead')).toBeNull();
  });

  it('handles "closed" keyword gracefully', () => {
    const result = parseOpeningHours('Mo-Fr 09:00-18:00; Sa closed; Su closed');
    expect(result).not.toBeNull();
    expect(result!.monday).toEqual([{ open: '09:00', close: '18:00' }]);
    // Sa and Su should not appear
    expect(result!.saturday).toBeUndefined();
    expect(result!.sunday).toBeUndefined();
  });
});

// ─── Task 2.12: Timezone validation tests ────────────────────────────────────

function makePlace(id: string, timezone?: string): Place {
  return { id, name: id, address: '', latitude: 0, longitude: 0, types: [], source: 'demo', ...(timezone ? { timezone } : {}) };
}

function makeActivity(id: string, placeId: string): Activity {
  return { id, placeId, durationMinutes: 60, reason: 'test' };
}

describe('extractTimezone', () => {
  it('returns undefined when no candidates provided', () => {
    const result = extractTimezone([], undefined);
    expect(result.timezone).toBeUndefined();
    expect(result.timezoneVerified).toBe(false);
  });

  it('returns undefined when no places have timezone', () => {
    const activities = [makeActivity('a1', 'p1'), makeActivity('a2', 'p2')];
    const candidates = [makePlace('p1'), makePlace('p2')];
    const result = extractTimezone(activities, candidates);
    expect(result.timezone).toBeUndefined();
    expect(result.timezoneVerified).toBe(false);
  });

  it('returns verified when all places share the same timezone', () => {
    const activities = [makeActivity('a1', 'p1'), makeActivity('a2', 'p2')];
    const candidates = [makePlace('p1', 'America/New_York'), makePlace('p2', 'America/New_York')];
    const result = extractTimezone(activities, candidates);
    expect(result.timezone).toBe('America/New_York');
    expect(result.timezoneVerified).toBe(true);
  });

  it('returns unverified when places span multiple timezones', () => {
    const activities = [makeActivity('a1', 'p1'), makeActivity('a2', 'p2')];
    const candidates = [makePlace('p1', 'America/New_York'), makePlace('p2', 'America/Chicago')];
    const result = extractTimezone(activities, candidates);
    expect(result.timezoneVerified).toBe(false);
  });

  it('does not claim an NYC-to-Chicago itinerary has one verified timezone', () => {
    const activities = [makeActivity('a1', 'nyc'), makeActivity('a2', 'chicago')];
    const candidates = [
      { ...makePlace('nyc', 'America/New_York'), name: 'New York City' },
      { ...makePlace('chicago', 'America/Chicago'), name: 'Chicago' },
    ];
    expect(extractTimezone(activities, candidates)).toEqual({
      timezone: 'America/New_York',
      timezoneVerified: false,
    });
  });

  it('ignores candidates not in the itinerary', () => {
    const activities = [makeActivity('a1', 'p1')];
    const candidates = [
      makePlace('p1', 'America/New_York'),
      makePlace('p2', 'America/Chicago'), // not in itinerary
    ];
    const result = extractTimezone(activities, candidates);
    expect(result.timezone).toBe('America/New_York');
    expect(result.timezoneVerified).toBe(true);
  });

  it('handles single-activity itinerary', () => {
    const activities = [makeActivity('a1', 'p1')];
    const candidates = [makePlace('p1', 'America/Los_Angeles')];
    const result = extractTimezone(activities, candidates);
    expect(result.timezone).toBe('America/Los_Angeles');
    expect(result.timezoneVerified).toBe(true);
  });
});

// ─── Task 2.9: buildCaveatNotice tests ───────────────────────────────────────

function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    activities: [],
    routes: [],
    issues: [],
    ...overrides,
  };
}

describe('buildCaveatNotice', () => {
  it('shows full caveat when nothing is verified', () => {
    const snapshot = makeSnapshot({ activities: [makeActivity('a1', 'p1')] });
    const candidates = [makePlace('p1')]; // no formattedOpeningHours, no timezone
    const notice = buildCaveatNotice(snapshot, candidates);
    expect(notice).toContain('Draft');
    expect(notice).toContain('opening hours');
    expect(notice).toContain('origin/destination travel');
  });

  it('removes opening hours from caveat when all places are verified', () => {
    const p1 = { ...makePlace('p1'), formattedOpeningHours: { monday: [{ open: '09:00', close: '18:00' }] } };
    const snapshot = makeSnapshot({ activities: [makeActivity('a1', 'p1')] });
    const notice = buildCaveatNotice(snapshot, [p1]);
    // Opening hours should not be listed
    expect(notice).not.toMatch(/opening hours for 1 venue/);
  });

  it('shows partial opening hours caveat when some places unverified', () => {
    const p1 = { ...makePlace('p1'), formattedOpeningHours: { monday: [{ open: '09:00', close: '18:00' }] } };
    const p2 = makePlace('p2'); // no hours
    const snapshot = makeSnapshot({
      activities: [makeActivity('a1', 'p1'), makeActivity('a2', 'p2')],
    });
    const notice = buildCaveatNotice(snapshot, [p1, p2]);
    expect(notice).toContain('opening hours for 1 venue');
  });

  it('produces fully verified notice when all dimensions are satisfied', () => {
    const p1 = {
      ...makePlace('p1', 'America/New_York'),
      formattedOpeningHours: { monday: [{ open: '09:00', close: '18:00' }] },
    };
    const originPoint = { latitude: 40.75, longitude: -73.99, formattedAddress: 'Penn Station' };
    const mockTransport = { id: 'walk:origin:p1', mode: 'walk' as const, durationMinutes: 20, walkingMinutes: 20, transfers: 0, distanceMeters: 1500, lines: [] };
    const firstLeg = { fromActivityId: 'origin', toActivityId: 'a1', fromPlaceId: 'origin', toPlaceId: 'p1', selected: mockTransport, options: [mockTransport] };
    const returnLeg = { fromActivityId: 'a1', toActivityId: 'origin', fromPlaceId: 'p1', toPlaceId: 'origin', selected: mockTransport, options: [mockTransport] };
    const snapshot = makeSnapshot({
      activities: [makeActivity('a1', 'p1')],
      origin: originPoint,
      firstLeg,
      returnLeg,
    });
    const notice = buildCaveatNotice(snapshot, [p1]);
    // Should not contain "Draft" and should say verified
    expect(notice).toContain('verified');
    expect(notice).not.toContain('Not verified');
  });
});
