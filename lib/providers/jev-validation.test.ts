/**
 * Tests for Priority 3: Enhanced Jev Validation
 * Tasks 3.14 (opening hours validation) and 3.15 (accessibility validation)
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import { JevProvider } from './jev';
import { buildDetailedSchedule, detectAccessibilityConstraints } from '../planning-context';
import type { Activity, Place, TripRequest } from '../domain';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<TripRequest> = {}): TripRequest {
  return {
    destination: 'New York City',
    origin: 'Penn Station',
    startAt: '2026-10-12T09:00:00',
    endAt: '2026-10-12T19:00:00',
    preference: 'Art and local neighborhoods',
    mode: 'fixture',
    ...overrides,
  };
}

function makeActivity(id: string, placeId: string, durationMinutes = 90): Activity {
  return { id, placeId, durationMinutes, reason: 'test' };
}

function makePlace(id: string, overrides: Partial<Place> = {}): Place {
  return {
    id,
    name: id,
    address: '',
    latitude: 40.75,
    longitude: -73.99,
    types: ['museum'],
    source: 'demo',
    ...overrides,
  };
}

const signal = new AbortController().signal;
const jev = new JevProvider(true); // fixture mode

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ─── Task 3.14: Opening hours validation edge cases ──────────────────────────

describe('validateOpeningHours (fixture mode)', () => {
  it('passes when all activities fit their opening hours', async () => {
    // Museum open Mo-Fr 10:00-18:00; visit scheduled 10:00-11:30 on Monday (index 0)
    const request = makeRequest({ startAt: '2026-10-12T10:00:00', endAt: '2026-10-12T19:00:00' });
    // 2026-10-12 is a Monday
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', {
      formattedOpeningHours: { monday: [{ open: '10:00', close: '18:00' }] },
      timezone: 'America/New_York',
    });
    const issues = await jev.validateOpeningHours(request, [place], activities, [], 1, signal);
    const flags = issues.filter(i => i.status === 'flag');
    expect(flags).toHaveLength(0);
  });

  it('flags an activity scheduled on a closed day', async () => {
    // Wednesday closed; 2026-10-14 is Wednesday
    const request = makeRequest({ startAt: '2026-10-14T10:00:00', endAt: '2026-10-14T19:00:00' });
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', {
      formattedOpeningHours: {
        monday: [{ open: '10:00', close: '18:00' }],
        wednesday: [], // explicitly empty = closed
      },
    });
    const issues = await jev.validateOpeningHours(request, [place], activities, [], 1, signal);
    const flags = issues.filter(i => i.status === 'flag' && i.checkId === 'opening_hours_fit');
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].subjectIds).toContain('a1');
  });

  it('flags an activity scheduled outside opening hours', async () => {
    // Museum closes at 17:00; activity scheduled 16:00-17:30 (90 min)
    const request = makeRequest({ startAt: '2026-10-12T16:00:00', endAt: '2026-10-12T20:00:00' });
    const activities = [makeActivity('a1', 'p1', 90)];
    const place = makePlace('p1', {
      formattedOpeningHours: { monday: [{ open: '10:00', close: '17:00' }] },
    });
    const issues = await jev.validateOpeningHours(request, [place], activities, [], 1, signal);
    const flags = issues.filter(i => i.status === 'flag' && i.checkId === 'opening_hours_fit');
    expect(flags.length).toBeGreaterThan(0);
  });

  it('marks unknown when no opening hours data is available', async () => {
    const request = makeRequest();
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1'); // no formattedOpeningHours
    const issues = await jev.validateOpeningHours(request, [place], activities, [], 1, signal);
    const unknowns = issues.filter(i => i.status === 'unknown' && i.checkId === 'opening_hours_fit');
    expect(unknowns.length).toBeGreaterThan(0);
  });

  it('flags a temporarily closed place (deterministic, task 3.9)', async () => {
    const request = makeRequest();
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', { operationalStatus: 'temporarily_closed' });
    const issues = await jev.validateOpeningHours(request, [place], activities, [], 1, signal);
    const flags = issues.filter(i => i.checkId === 'operational_status' && i.status === 'flag');
    expect(flags.length).toBe(1);
    expect(flags[0].message).toContain('temporarily closed');
  });

  it('flags a permanently closed place (deterministic, task 3.9)', async () => {
    const request = makeRequest();
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', { operationalStatus: 'permanently_closed' });
    const issues = await jev.validateOpeningHours(request, [place], activities, [], 1, signal);
    const flags = issues.filter(i => i.checkId === 'operational_status' && i.status === 'flag');
    expect(flags.length).toBe(1);
  });

  it('handles multi-activity schedule with travel time', async () => {
    // 09:00 start, first leg 20 min, then p1 90 min, then 25 min walk, then p2 60 min
    const request = makeRequest({ startAt: '2026-10-12T09:00:00' });
    const activities = [makeActivity('a1', 'p1', 90), makeActivity('a2', 'p2', 60)];
    const routes: (number | null)[] = [25];
    const p1 = makePlace('p1', { formattedOpeningHours: { monday: [{ open: '09:00', close: '18:00' }] } });
    const p2 = makePlace('p2', { formattedOpeningHours: { monday: [{ open: '11:00', close: '18:00' }] } });
    // p1 visit: 09:20-10:50 (after 20 min first leg), p2: 11:15-12:15
    const issues = await jev.validateOpeningHours(request, [p1, p2], activities, routes, 1, signal, 20);
    const flags = issues.filter(i => i.status === 'flag');
    expect(flags).toHaveLength(0);
  });

  it('returns empty array for empty activities', async () => {
    const request = makeRequest();
    const issues = await jev.validateOpeningHours(request, [], [], [], 1, signal);
    expect(issues).toHaveLength(0);
  });
});

// ─── Task 3.15: Accessibility validation tests ───────────────────────────────

describe('validateAccessibility (fixture mode)', () => {
  it('skips validation when no accessibility constraints', async () => {
    const request = makeRequest({ constraints: 'No dietary restrictions' });
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1');
    const issues = await jev.validateAccessibility(request, [place], activities, 1, signal);
    expect(issues).toHaveLength(0);
  });

  it('runs validation when wheelchair constraint is detected', async () => {
    const request = makeRequest({ constraints: 'Need wheelchair accessible venues' });
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', { accessibilityInfo: { wheelchairAccessible: true } });
    const issues = await jev.validateAccessibility(request, [place], activities, 1, signal);
    // Accessible place should not produce flag
    const flags = issues.filter(i => i.status === 'flag');
    expect(flags).toHaveLength(0);
  });

  it('flags a non-accessible place when wheelchair constraint specified', async () => {
    const request = makeRequest({ constraints: 'wheelchair user, need accessible routes' });
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', { accessibilityInfo: { wheelchairAccessible: false } });
    const issues = await jev.validateAccessibility(request, [place], activities, 1, signal);
    const flags = issues.filter(i => i.status === 'flag' && i.checkId === 'accessibility_fit');
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].subjectIds).toContain('a1');
  });

  it('marks unknown when no accessibility info available', async () => {
    const request = makeRequest({ constraints: 'wheelchair accessible only' });
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1'); // no accessibilityInfo
    const issues = await jev.validateAccessibility(request, [place], activities, 1, signal);
    const unknowns = issues.filter(i => i.status === 'unknown' && i.checkId === 'accessibility_fit');
    expect(unknowns.length).toBeGreaterThan(0);
  });

  it('marks missing information unknown when other activities have provider data', async () => {
    const request = makeRequest({ constraints: 'wheelchair accessible only' });
    const activities = [makeActivity('a1', 'p1'), makeActivity('a2', 'p2')];
    const places = [
      makePlace('p1', { accessibilityInfo: { wheelchairAccessible: true } }),
      makePlace('p2'),
    ];

    const issues = await jev.validateAccessibility(request, places, activities, 1, signal);

    expect(issues).toContainEqual(expect.objectContaining({
      checkId: 'accessibility_fit',
      status: 'unknown',
      subjectIds: ['a2'],
    }));
  });
});

describe('validateOpeningHours (live JevStation)', () => {
  it('accepts JevStation response envelopes', async () => {
    vi.stubEnv('JEV_API_KEY', 'test-key');
    vi.stubEnv('JEV_BASE_URL', 'https://jevstation.com/api');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 0,
      message: 'ok',
      data: {
        model: 'jev-1.13.0',
        answers: {
          a1: {
            type: 'choice',
            choice: 'pass',
            probabilities: { pass: 0.95, flag: 0.03, unknown: 0.02 },
            confidence: 0.95,
          },
        },
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new JevProvider(false);
    const request = makeRequest({ mode: 'live', startAt: '2026-10-12T10:00:00' });
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', {
      formattedOpeningHours: { monday: [{ open: '09:00', close: '18:00' }] },
    });

    const issues = await provider.validateOpeningHours(request, [place], activities, [], 1, signal);

    expect(issues).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://jevstation.com/api/v1/systemone',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
  });

  it('returns an unknown validation issue when JevStation rejects the evaluation', async () => {
    vi.stubEnv('JEV_API_KEY', 'test-key');
    vi.stubEnv('JEV_BASE_URL', 'https://jevstation.com/api');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: -1,
      message: 'credits exhausted',
    }), { status: 200 })));
    const provider = new JevProvider(false);
    const request = makeRequest({ mode: 'live', startAt: '2026-10-12T10:00:00' });
    const activities = [makeActivity('a1', 'p1')];
    const place = makePlace('p1', {
      formattedOpeningHours: { monday: [{ open: '09:00', close: '18:00' }] },
    });

    const issues = await provider.validateOpeningHours(request, [place], activities, [], 1, signal);

    expect(issues).toContainEqual(expect.objectContaining({
      checkId: 'opening_hours_fit',
      status: 'unknown',
      subjectIds: ['a1'],
      message: expect.stringContaining('could not be completed'),
    }));
    expect(issues[0].evidence).toContain('Jev request failed: credits exhausted');
  });

  it('marks activities without opening-hour data unknown when others have data', async () => {
    const request = makeRequest();
    const activities = [makeActivity('a1', 'p1'), makeActivity('a2', 'p2')];
    const places = [
      makePlace('p1', { formattedOpeningHours: { monday: [{ open: '09:00', close: '18:00' }] } }),
      makePlace('p2'),
    ];

    const issues = await jev.validateOpeningHours(request, places, activities, [], 1, signal);

    expect(issues).toContainEqual(expect.objectContaining({
      checkId: 'opening_hours_fit',
      status: 'unknown',
      subjectIds: ['a2'],
    }));
  });
});

// ─── Task 3.7: detectAccessibilityConstraints ────────────────────────────────

describe('detectAccessibilityConstraints', () => {
  it('returns false for empty / no constraints', () => {
    expect(detectAccessibilityConstraints(undefined)).toBe(false);
    expect(detectAccessibilityConstraints('')).toBe(false);
    expect(detectAccessibilityConstraints('No dietary restrictions')).toBe(false);
  });

  it('detects wheelchair keyword', () => {
    expect(detectAccessibilityConstraints('I use a wheelchair')).toBe(true);
  });

  it('detects accessible keyword', () => {
    expect(detectAccessibilityConstraints('Need accessible venues')).toBe(true);
  });

  it('detects mobility keyword', () => {
    expect(detectAccessibilityConstraints('mobility issues')).toBe(true);
  });

  it('detects disabled keyword', () => {
    expect(detectAccessibilityConstraints('disabled traveler')).toBe(true);
  });

  it('detects stroller keyword', () => {
    expect(detectAccessibilityConstraints('traveling with a stroller')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(detectAccessibilityConstraints('WHEELCHAIR ACCESSIBLE ONLY')).toBe(true);
  });
});

// ─── Task 3.4-3.5: buildDetailedSchedule ─────────────────────────────────────

describe('buildDetailedSchedule', () => {
  it('returns empty array for no activities', () => {
    const result = buildDetailedSchedule(makeRequest(), [], []);
    expect(result).toHaveLength(0);
  });

  it('computes correct start time for first activity with first leg', () => {
    // Start 09:00, first leg 20 min → first activity at 09:20
    const request = makeRequest({ startAt: '2026-10-12T09:00:00' });
    const activities = [makeActivity('a1', 'p1', 90)];
    const result = buildDetailedSchedule(request, activities, [], 20);
    expect(result[0].scheduledStart).toBe('2026-10-12T09:20:00.000Z');
    expect(result[0].scheduledEnd).toBe('2026-10-12T10:50:00.000Z');
  });

  it('accumulates travel time between activities', () => {
    const request = makeRequest({ startAt: '2026-10-12T09:00:00' });
    const activities = [makeActivity('a1', 'p1', 60), makeActivity('a2', 'p2', 90)];
    const routes: (number | null)[] = [30]; // 30 min between a1 and a2
    const result = buildDetailedSchedule(request, activities, routes, 0);
    // a1: 09:00-10:00, a2: 10:30-12:00
    expect(result[0].scheduledStart).toBe('2026-10-12T09:00:00.000Z');
    expect(result[1].scheduledStart).toBe('2026-10-12T10:30:00.000Z');
    expect(result[1].scheduledEnd).toBe('2026-10-12T12:00:00.000Z');
  });

  it('assigns correct day of week', () => {
    // 2026-10-12 is Monday
    const result = buildDetailedSchedule(makeRequest(), [makeActivity('a1', 'p1', 60)], []);
    expect(result[0].dayOfWeek).toBe('monday');
  });

  it('handles null route times gracefully (treats as 0)', () => {
    const activities = [makeActivity('a1', 'p1', 60), makeActivity('a2', 'p2', 60)];
    const routes: (number | null)[] = [null];
    const result = buildDetailedSchedule(makeRequest(), activities, routes, 0);
    // null route treated as 0 — a2 starts immediately after a1
    expect(result[1].scheduledStart).toBe(result[0].scheduledEnd);
  });
});
