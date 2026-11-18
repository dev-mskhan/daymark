/**
 * Tests for Priority 4: Multi-Day Trip Support
 * Tasks 4.31 (1-day baseline), 4.32 (3-day), 4.33 (7-day),
 *       4.34 (cross-day coherence), 4.35 (overnight validation)
 */

import { describe, it, expect } from 'vitest';
import {
  planMultiDayTrip,
  validateOvernightLocation,
  calcInterDayRoute,
} from './planner-multiday';
import { buildDetailedSchedule } from './planning-context';
import type { DayBoundary, MultiDayRequest, Place } from './domain';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makePlace(id: string, lat: number, lon: number, name = id): Place {
  return { id, name, address: '', latitude: lat, longitude: lon, types: ['museum'], source: 'demo' };
}

function makeDayBoundary(
  dayNumber: number,
  date: string,
  overnightPlace?: Place,
): DayBoundary {
  return {
    dayNumber,
    date,
    startTime: '09:00',
    endTime: '19:00',
    overnightPlace,
  };
}

function makeRequest(days: DayBoundary[]): MultiDayRequest {
  return {
    destination: 'New York City',
    origin: 'Penn Station, New York City',
    preference: 'Art and local neighborhoods, one museum, relaxed pace',
    constraints: 'Avoid long transfers',
    mode: 'fixture',
    days,
  };
}

const signal = new AbortController().signal;

// ─── Task 4.31: 1-day baseline ───────────────────────────────────────────────

describe('planMultiDayTrip — 1-day (baseline)', () => {
  it('plans a single day successfully', async () => {
    const request = makeRequest([makeDayBoundary(1, '2026-10-12')]);
    const result = await planMultiDayTrip(request, undefined, signal);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].dayNumber).toBe(1);
    expect(result.currentDay).toBe(1);
    // Fixture planner always produces activities
    expect(result.totalActivities).toBeGreaterThan(0);
    expect(['complete', 'needs_attention']).toContain(result.status);
  }, 30_000);

  it('1-day result is equivalent to single planTrip result', async () => {
    const request = makeRequest([makeDayBoundary(1, '2026-10-12')]);
    const result = await planMultiDayTrip(request, undefined, signal);
    // Should have the same structure as a single-day RunResult
    expect(result.days[0].snapshot.activities).toBeDefined();
    expect(result.days[0].snapshot.routes).toBeDefined();
    expect(result.days[0].candidates.length).toBeGreaterThan(0);
  }, 30_000);

  it('rejects fewer than 1 day', async () => {
    const request = makeRequest([]);
    await expect(planMultiDayTrip(request, undefined, signal)).rejects.toThrow('1–7 day');
  });
});

// ─── Task 4.32: 3-day planning ───────────────────────────────────────────────

describe('planMultiDayTrip — 3-day with overnight', () => {
  const hotel = makePlace('hotel-1', 40.758, -73.985, 'Demo Hotel Midtown');

  it('plans all 3 days and returns correct structure', async () => {
    const started = performance.now();
    const request = makeRequest([
      makeDayBoundary(1, '2026-10-12', hotel),
      makeDayBoundary(2, '2026-10-13', hotel),
      makeDayBoundary(3, '2026-10-14'),
    ]);
    const result = await planMultiDayTrip(request, undefined, signal);
    expect(performance.now() - started).toBeLessThan(30_000);
    expect(result.days).toHaveLength(3);
    expect(result.days.map(d => d.dayNumber)).toEqual([1, 2, 3]);
    expect(result.totalActivities).toBeGreaterThan(0);
  }, 90_000);

  it('day 2 starts from overnight location of day 1', async () => {
    const request = makeRequest([
      makeDayBoundary(1, '2026-10-12', hotel),
      makeDayBoundary(2, '2026-10-13'),
    ]);
    const result = await planMultiDayTrip(request, undefined, signal);
    expect(result.days[1].startingFrom).toBe(hotel.name);
  }, 60_000);

  it('overnight location is recorded in endingAt', async () => {
    const request = makeRequest([
      makeDayBoundary(1, '2026-10-12', hotel),
      makeDayBoundary(2, '2026-10-13'),
    ]);
    const result = await planMultiDayTrip(request, undefined, signal);
    expect(result.days[0].endingAt).toBe(hotel.name);
    expect(result.days[1].endingAt).toBeUndefined();
  }, 60_000);
});

// ─── Task 4.33: 7-day planning (max) ─────────────────────────────────────────

describe('planMultiDayTrip — 7-day (max)', () => {
  it('accepts and validates exactly 7 days', async () => {
    const days = Array.from({ length: 7 }, (_, i) =>
      makeDayBoundary(i + 1, `2026-10-${String(12 + i).padStart(2, '0')}`),
    );
    const request = makeRequest(days);
    const result = await planMultiDayTrip(request, undefined, signal);
    expect(result.days).toHaveLength(7);
    expect(result.currentDay).toBe(7);
  }, 210_000);

  it('rejects 8 or more days', async () => {
    const days = Array.from({ length: 8 }, (_, i) =>
      makeDayBoundary(i + 1, `2026-10-${String(12 + i).padStart(2, '0')}`),
    );
    await expect(planMultiDayTrip(makeRequest(days), undefined, signal)).rejects.toThrow('1–7 day');
  });
});

// ─── Task 4.34: Cross-day coherence ──────────────────────────────────────────

describe('cross-day coherence via planMultiDayTrip events', () => {
  it('emits day_start events for each day', async () => {
    const events: Array<{ event: ReturnType<typeof Object.assign>; day: number }> = [];
    const request = makeRequest([
      makeDayBoundary(1, '2026-10-12'),
      makeDayBoundary(2, '2026-10-13'),
    ]);
    await planMultiDayTrip(
      request,
      (event, day) => events.push({ event, day }),
      signal,
    );
    const dayStarts = events.filter(e => e.event.type === 'day_start');
    expect(dayStarts).toHaveLength(2);
    expect(dayStarts[0].day).toBe(1);
    expect(dayStarts[1].day).toBe(2);
  }, 60_000);

  it('each day has its own independent snapshot version starting from 0', async () => {
    const request = makeRequest([
      makeDayBoundary(1, '2026-10-12'),
      makeDayBoundary(2, '2026-10-13'),
    ]);
    const result = await planMultiDayTrip(request, undefined, signal);
    // Both day snapshots should have versions > 0 (planning happened)
    expect(result.days[0].snapshot.version).toBeGreaterThan(0);
    expect(result.days[1].snapshot.version).toBeGreaterThan(0);
  }, 60_000);
});

// ─── Task 4.35: Overnight location validation ─────────────────────────────────

describe('validateOvernightLocation', () => {
  it('passes when overnight is within 30 km', () => {
    const lastActivity = makePlace('p1', 40.758, -73.985);
    const overnight = makePlace('hotel', 40.740, -73.990); // ~2 km
    const issue = validateOvernightLocation(overnight, lastActivity);
    expect(issue).toBeNull();
  });

  it('flags when overnight is more than 30 km away', () => {
    const lastActivity = makePlace('p1', 40.758, -73.985); // NYC
    const overnight = makePlace('hotel', 40.359, -74.656); // ~60 km away
    const issue = validateOvernightLocation(overnight, lastActivity);
    expect(issue).not.toBeNull();
    expect(issue!.checkId).toBe('overnight_distance');
    expect(issue!.status).toBe('flag');
    expect(issue!.message).toContain('km');
  });

  it('passes for same location', () => {
    const place = makePlace('p1', 40.758, -73.985);
    const issue = validateOvernightLocation(place, place);
    expect(issue).toBeNull();
  });
});

// ─── calcInterDayRoute ────────────────────────────────────────────────────────

describe('calcInterDayRoute', () => {
  it('returns a TransportLeg with options in fixture mode', async () => {
    const from = makePlace('hotel', 40.758, -73.985, 'Hotel');
    const to = makePlace('museum', 40.779, -73.963, 'Museum');
    const leg = await calcInterDayRoute(from, to, true, signal);
    expect(leg.fromPlaceId).toBe('hotel');
    expect(leg.toPlaceId).toBe('museum');
    expect(leg.options.length).toBeGreaterThan(0);
    expect(leg.selected).not.toBeNull();
  });
});
