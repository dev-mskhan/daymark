/**
 * Phase 1.1 — Schedule computation tests.
 *
 * Key invariant: arrival at stop N = departure from stop N-1 + transit(N-1→N).
 * For stop 0: arrival = windowStart + firstLegMinutes (not windowStart).
 */

import { describe, expect, it } from 'vitest';
import { buildSchedule, formatTime, toMinutes } from './schedule';
import type { Activity } from './domain';

function activity(id: string, durationMinutes: number): Activity {
  return { id, placeId: `place-${id}`, durationMinutes, reason: 'test' };
}

describe('buildSchedule', () => {
  it('returns empty array for no activities', () => {
    expect(buildSchedule([], [], null)).toEqual([]);
  });

  it('without origin: first stop offset is 0 (pass 0 explicitly)', () => {
    const result = buildSchedule([activity('a', 60)], [], 0);
    expect(result).toEqual([0]);
  });

  it('with firstLeg: first stop offset equals firstLegMinutes', () => {
    // This was the Phase 1.1 bug: first stop was always 0 regardless of firstLeg.
    const result = buildSchedule([activity('a', 60)], [], 18);
    expect(result[0]).toBe(18);
  });

  it('arrival at stop N = previous departure + transit (the core invariant)', () => {
    // start 09:00, firstLeg 18 min
    // stop 1: arrives 09:18, departs 10:18 (60 min)
    // transit 20 min
    // stop 2: arrives 10:38, departs 11:38 (60 min)
    const acts = [activity('a', 60), activity('b', 60)];
    const routes: (number | null)[] = [20];
    const offsets = buildSchedule(acts, routes, 18);

    expect(offsets[0]).toBe(18);                // stop 1 at +18 min
    expect(offsets[1]).toBe(18 + 60 + 20);      // stop 2 at +98 min
  });

  it('propagates null when a transit leg is unknown', () => {
    const acts = [activity('a', 60), activity('b', 60), activity('c', 60)];
    const routes: (number | null)[] = [null, 15];
    const offsets = buildSchedule(acts, routes, 0);

    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(null);  // unknown transit → null
    expect(offsets[2]).toBe(null);  // downstream also null
  });

  it('with firstLeg null (unknown origin transit): first stop is null, downstream null', () => {
    // When an origin is configured but routing failed, firstLegMinutes is null.
    // The page distinguishes: no origin → pass 0; origin with unknown transit → pass null.
    // We can't know when to leave so the whole schedule is unknown.
    // NOTE: null firstLegMinutes propagates null from stop 0 onward.
    // The buildSchedule function treats null exactly like a null route entry.
    // Since null firstLeg means "unknown departure", offsets start null.
    // This test documents the actual behavior: null input → null output for stop 0.
    // (The page handles this by showing "TBD" for all times when origin transit is unknown.)
    const acts = [activity('a', 60), activity('b', 60)];
    const routes: (number | null)[] = [15];
    // We'll use the EXPLICIT null path: start elapsed=null, so stop 0 offset is null.
    // But buildSchedule defaults null to 0 (no-origin case).
    // The page should pass 0 when there's no origin, and the actual unknown firstLeg
    // minutes when the origin transit failed — except those come through as null from
    // firstLeg.selected?.durationMinutes. So null arg → treat as 0 (no origin).
    // Explicitly: when origin exists but transit unknown, page should use a special sentinel.
    // For this implementation, null = unknown. The schedule propagates null from stop 0.
    // Let's verify the actual function behavior:
    const offsets = buildSchedule(acts, routes, null);
    // null firstLegMinutes: elapsed starts as null
    expect(offsets[0]).toBe(null);  // unknown → null
    expect(offsets[1]).toBe(null);  // downstream also null
  });

  it('handles three stops with known legs including firstLeg', () => {
    // 09:00 start, firstLeg 10 min
    // stop A: arrives 09:10, 90 min → departs 10:40
    // transit 20 min
    // stop B: arrives 11:00, 60 min → departs 12:00
    // transit 15 min
    // stop C: arrives 12:15
    const acts = [activity('a', 90), activity('b', 60), activity('c', 45)];
    const routes: (number | null)[] = [20, 15];
    const offsets = buildSchedule(acts, routes, 10);

    expect(offsets[0]).toBe(10);
    expect(offsets[1]).toBe(10 + 90 + 20);   // 120
    expect(offsets[2]).toBe(120 + 60 + 15);  // 195
  });

  it('without origin provided: default firstLeg is 0, first stop at offset 0', () => {
    // When firstLegMinutes argument itself is omitted/undefined, default is 0
    const acts = [activity('a', 60), activity('b', 30)];
    const routes: (number | null)[] = [15];
    const offsets = buildSchedule(acts, routes);

    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBe(60 + 15);  // 75
  });
});

describe('formatTime', () => {
  it('formats correctly at zero offset', () => {
    expect(formatTime('09:00', 0)).toBe('09:00');
  });

  it('formats correctly with offset within the same hour', () => {
    expect(formatTime('09:00', 18)).toBe('09:18');
  });

  it('rolls over hours correctly', () => {
    expect(formatTime('09:00', 90)).toBe('10:30');
  });

  it('handles minutes carrying into hours', () => {
    expect(formatTime('08:45', 30)).toBe('09:15');
  });

  it('wraps past midnight', () => {
    expect(formatTime('23:00', 90)).toBe('00:30');
  });

  it('returns TBD for bad input', () => {
    expect(formatTime('invalid', 10)).toBe('TBD');
  });
});

describe('toMinutes', () => {
  it('converts 09:00 to 540', () => {
    expect(toMinutes('09:00')).toBe(540);
  });

  it('converts 00:00 to 0', () => {
    expect(toMinutes('00:00')).toBe(0);
  });

  it('converts 19:30 to 1170', () => {
    expect(toMinutes('19:30')).toBe(1170);
  });

  it('returns null for empty string', () => {
    expect(toMinutes('')).toBeNull();
  });

  it('returns null for non-time string', () => {
    expect(toMinutes('morning')).toBeNull();
  });
});
