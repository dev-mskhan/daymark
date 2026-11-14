/**
 * Drizzle schema for multi-day trip tables.
 * Tasks 4.13–4.14 (schema), 4.15 (migration SQL stub)
 *
 * NOTE: Full Drizzle + Supabase wiring happens in Priority 6.
 * This file defines the TypeScript schema types and SQL for review.
 */

// ─── SQL Migration (Task 4.15) ───────────────────────────────────────────────
//
// Run against Supabase via DIRECT_URL when Priority 6 sets up the DB:
//
// CREATE TABLE day_boundary (
//   id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   trip_id          UUID NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
//   day_number       INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 7),
//   date             DATE NOT NULL,
//   start_time       TIME NOT NULL,
//   end_time         TIME NOT NULL,
//   overnight_place_id   TEXT,
//   overnight_place_data JSONB,
//   created_at       TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(trip_id, day_number)
// );
//
// CREATE TABLE day_segment (
//   id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//   trip_revision_id    UUID NOT NULL REFERENCES trip_revision(id) ON DELETE CASCADE,
//   day_number          INTEGER NOT NULL CHECK (day_number BETWEEN 1 AND 7),
//   activities          JSONB NOT NULL,
//   routes              JSONB NOT NULL,
//   transport_legs      JSONB,
//   starting_from       TEXT NOT NULL,
//   ending_at           TEXT,
//   snapshot_json       JSONB NOT NULL,
//   events_json         JSONB,
//   created_at          TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE(trip_revision_id, day_number)
// );

// ─── TypeScript column types (used by Drizzle in Priority 6) ─────────────────

export interface DayBoundaryRow {
  id: string;
  trip_id: string;
  day_number: number;
  date: string;              // YYYY-MM-DD
  start_time: string;        // HH:MM:SS
  end_time: string;
  overnight_place_id: string | null;
  overnight_place_data: unknown | null;
  created_at: string;
}

export interface DaySegmentRow {
  id: string;
  trip_revision_id: string;
  day_number: number;
  activities: unknown;       // JSON array of Activity[]
  routes: unknown;           // JSON array of (number|null)[]
  transport_legs: unknown | null;
  starting_from: string;
  ending_at: string | null;
  snapshot_json: unknown;    // full Snapshot JSON
  events_json: unknown | null;
  created_at: string;
}

// ─── Insert helpers (Task 4.19–4.20) ─────────────────────────────────────────

import type { DayBoundary, DaySegment } from '../domain';

/** Convert domain DayBoundary → DB row for insertion (Task 4.19). */
export function dayBoundaryToRow(
  tripId: string,
  boundary: DayBoundary,
): Omit<DayBoundaryRow, 'id' | 'created_at'> {
  return {
    trip_id: tripId,
    day_number: boundary.dayNumber,
    date: boundary.date,
    start_time: boundary.startTime + ':00',
    end_time: boundary.endTime + ':00',
    overnight_place_id: boundary.overnightPlace?.id ?? null,
    overnight_place_data: boundary.overnightPlace ?? null,
  };
}

/** Convert domain DaySegment → DB row for insertion (Task 4.20). */
export function daySegmentToRow(
  tripRevisionId: string,
  segment: DaySegment,
): Omit<DaySegmentRow, 'id' | 'created_at'> {
  return {
    trip_revision_id: tripRevisionId,
    day_number: segment.dayNumber,
    activities: segment.snapshot.activities,
    routes: segment.snapshot.routes,
    transport_legs: segment.snapshot.transportLegs ?? null,
    starting_from: segment.startingFrom,
    ending_at: segment.endingAt ?? null,
    snapshot_json: segment.snapshot,
    events_json: segment.events,
  };
}

/** Reconstruct DaySegment from DB row (Task 4.21). */
export function rowToDaySegment(row: DaySegmentRow): DaySegment {
  const snapshot = row.snapshot_json as DaySegment['snapshot'];
  return {
    dayNumber: row.day_number,
    startingFrom: row.starting_from,
    endingAt: row.ending_at ?? undefined,
    snapshot,
    candidates: [],           // candidates re-fetched on load; not stored in DB
    events: (row.events_json as DaySegment['events']) ?? [],
  };
}
