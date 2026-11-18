/**
 * Schedule computation helpers.
 *
 * buildSchedule() computes per-activity minute offsets from the window start,
 * correctly accounting for the first-leg transit before stop 1.
 *
 * buildTimelineSchedule() converts those offsets to HH:MM strings for display.
 */

import type { Activity } from './domain';

/**
 * Returns minute offsets (from windowStart) for every activity.
 *
 * - firstLegMinutes: travel from origin to first stop. When present, stop 1
 *   starts at firstLegMinutes, not 0.
 * - routes[i]: travel between activity i and activity i+1.
 *
 * Returns null for an offset when any preceding transit time is unknown.
 */
export function buildSchedule(
  activities: Activity[],
  routes: (number | null)[],
  firstLegMinutes: number | null = 0,
): (number | null)[] {
  const offsets: (number | null)[] = [];
  // Start offset: null = unknown origin transit (propagates nulls downstream).
  // 0 = no origin configured, or origin with known 0-min transit.
  let elapsed: number | null = firstLegMinutes;

  for (let i = 0; i < activities.length; i++) {
    if (i > 0) {
      const transit = routes[i - 1];
      elapsed =
        elapsed === null || transit === null || transit === undefined
          ? null
          : elapsed + transit;
    }
    offsets.push(elapsed);
    if (elapsed !== null) elapsed += activities[i].durationMinutes;
  }
  return offsets;
}

/** Convert a "HH:MM" window start + minute offset to a "HH:MM" display string. */
export function formatTime(windowStart: string, offsetMinutes: number): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(windowStart);
  if (!match) return 'TBD';
  const h = Number(match[1]);
  const m = Number(match[2]);
  const total = h * 60 + m + offsetMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Parse "HH:MM" to minutes-from-midnight. Returns null on bad input. */
export function toMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
