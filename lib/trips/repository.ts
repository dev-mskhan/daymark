import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { DaySegment, Place } from '@/lib/domain';
import type { AppDb } from '@/lib/db';
import {
  dayBoundary,
  daySegment,
  planningRun,
  trip,
  tripRevision,
  userProfile,
  type DayBoundaryRecord,
  type DaySegmentRecord,
  type Trip,
} from '@/lib/db/schema';
import { daySegmentToRow } from '@/lib/db/schema-multiday';
import type { CreateTripInput, DayBoundaryInput, UpdateTripInput } from './schemas';

/**
 * Trip persistence. The server's database role bypasses RLS, so EVERY function here scopes by the
 * session user's id (`ownerId`) — never an id from a request body. Missing and foreign trips are
 * indistinguishable (null), so ownership cannot be probed.
 */

export interface StoredPlanResult {
  status: 'complete' | 'needs_attention' | 'partial';
  days: DaySegment[];
}
export interface TripDetail {
  trip: Trip;
  days: DayBoundaryRecord[];
  latestRevision: { id: string; revisionNumber: number; acceptedAt: Date; segments: DaySegmentRecord[] } | null;
  latestRun: { id: string; status: string; createdAt: Date } | null;
}

const toBoundaryRow = (tripId: string, day: DayBoundaryInput) => ({
  tripId,
  dayNumber: day.dayNumber,
  date: day.date,
  startTime: `${day.startTime}:00`,
  endTime: `${day.endTime}:00`,
  overnightPlaceId: day.overnightPlace?.id ?? null,
  overnightPlaceData: day.overnightPlace ?? null,
});

async function findOwned(db: AppDb, ownerId: string, tripId: string) {
  const [row] = await db.select().from(trip).where(and(eq(trip.id, tripId), eq(trip.ownerId, ownerId)));
  return row ?? null;
}

export async function createTrip(db: AppDb, ownerId: string, input: CreateTripInput): Promise<TripDetail> {
  const id = await db.transaction(async tx => {
    const [created] = await tx.insert(trip).values({
      ownerId,
      title: input.title,
      destination: input.destination,
      origin: input.origin ?? null,
      partySize: input.partySize,
      preference: input.preference,
      constraints: input.constraints,
      mode: input.mode,
    }).returning({ id: trip.id });
    if (input.days.length) await tx.insert(dayBoundary).values(input.days.map(day => toBoundaryRow(created.id, day)));
    return created.id;
  });
  return (await getTripDetail(db, ownerId, id))!;
}

export async function listTrips(db: AppDb, ownerId: string, { includeArchived = false } = {}): Promise<Trip[]> {
  return db.select().from(trip)
    .where(includeArchived ? eq(trip.ownerId, ownerId) : and(eq(trip.ownerId, ownerId), ne(trip.status, 'archived')))
    .orderBy(desc(trip.updatedAt));
}

export async function getTripDetail(db: AppDb, ownerId: string, tripId: string): Promise<TripDetail | null> {
  const found = await findOwned(db, ownerId, tripId);
  if (!found) return null;
  const days = await db.select().from(dayBoundary).where(eq(dayBoundary.tripId, tripId)).orderBy(dayBoundary.dayNumber);
  const [revision] = await db.select().from(tripRevision).where(eq(tripRevision.tripId, tripId)).orderBy(desc(tripRevision.revisionNumber)).limit(1);
  const segments = revision
    ? await db.select().from(daySegment).where(eq(daySegment.tripRevisionId, revision.id)).orderBy(daySegment.dayNumber)
    : [];
  const [run] = await db.select({ id: planningRun.id, status: planningRun.status, createdAt: planningRun.createdAt })
    .from(planningRun).where(eq(planningRun.tripId, tripId)).orderBy(desc(planningRun.createdAt)).limit(1);
  return {
    trip: found,
    days,
    latestRevision: revision ? { id: revision.id, revisionNumber: revision.revisionNumber, acceptedAt: revision.acceptedAt, segments } : null,
    latestRun: run ?? null,
  };
}

export type UpdateResult = { kind: 'ok'; detail: TripDetail } | { kind: 'not_found' } | { kind: 'archived' };

export async function updateTrip(db: AppDb, ownerId: string, tripId: string, patch: UpdateTripInput): Promise<UpdateResult> {
  const existing = await findOwned(db, ownerId, tripId);
  if (!existing) return { kind: 'not_found' };
  if (existing.status === 'archived') return { kind: 'archived' };
  const { days, ...fields } = patch;
  await db.transaction(async tx => {
    await tx.update(trip).set({
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.destination !== undefined && { destination: fields.destination }),
      ...(fields.origin !== undefined && { origin: fields.origin }),
      ...(fields.partySize !== undefined && { partySize: fields.partySize }),
      ...(fields.preference !== undefined && { preference: fields.preference }),
      ...(fields.constraints !== undefined && { constraints: fields.constraints }),
      ...(fields.mode !== undefined && { mode: fields.mode }),
      updatedAt: new Date(),
    }).where(and(eq(trip.id, tripId), eq(trip.ownerId, ownerId)));
    if (days) {
      await tx.delete(dayBoundary).where(eq(dayBoundary.tripId, tripId));
      if (days.length) await tx.insert(dayBoundary).values(days.map(day => toBoundaryRow(tripId, day)));
    }
  });
  return { kind: 'ok', detail: (await getTripDetail(db, ownerId, tripId))! };
}

export async function archiveTrip(db: AppDb, ownerId: string, tripId: string): Promise<Trip | null> {
  const [row] = await db.update(trip).set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(trip.id, tripId), eq(trip.ownerId, ownerId))).returning();
  return row ?? null;
}

export async function deleteTrip(db: AppDb, ownerId: string, tripId: string): Promise<boolean> {
  const rows = await db.delete(trip).where(and(eq(trip.id, tripId), eq(trip.ownerId, ownerId))).returning({ id: trip.id });
  return rows.length > 0;
}

/** Copies the trip inputs and day structure as a new draft. Plans and revisions are not copied. */
export async function duplicateTrip(db: AppDb, ownerId: string, tripId: string): Promise<TripDetail | null> {
  const source = await getTripDetail(db, ownerId, tripId);
  if (!source) return null;
  const id = await db.transaction(async tx => {
    const [copy] = await tx.insert(trip).values({
      ownerId,
      title: `Copy of ${source.trip.title}`.slice(0, 120),
      destination: source.trip.destination,
      origin: source.trip.origin,
      partySize: source.trip.partySize,
      preference: source.trip.preference,
      constraints: source.trip.constraints,
      mode: source.trip.mode,
    }).returning({ id: trip.id });
    if (source.days.length)
      await tx.insert(dayBoundary).values(source.days.map(({ id: _id, tripId: _tripId, createdAt: _createdAt, ...rest }) => ({ ...rest, tripId: copy.id })));
    return copy.id;
  });
  return getTripDetail(db, ownerId, id);
}

export interface RunInput {
  mode: 'fixture' | 'live';
  status: 'complete' | 'needs_attention' | 'failed';
  events: unknown[];
  result?: StoredPlanResult;
  errorMessage?: string;
}

export async function savePlanningRun(db: AppDb, ownerId: string, tripId: string, input: RunInput): Promise<string | null> {
  if (!(await findOwned(db, ownerId, tripId))) return null;
  return db.transaction(async tx => {
    const [run] = await tx.insert(planningRun).values({
      tripId,
      mode: input.mode,
      status: input.status,
      eventsJson: input.events,
      resultJson: input.result ?? null,
      errorMessage: input.errorMessage ?? null,
    }).returning({ id: planningRun.id });
    if (input.status !== 'failed')
      await tx.update(trip).set({ status: sql`case when ${trip.status} = 'accepted' then 'accepted' else 'planned' end`, updatedAt: new Date() })
        .where(and(eq(trip.id, tripId), eq(trip.ownerId, ownerId)));
    return run.id;
  });
}

export type AcceptResult =
  | { kind: 'ok'; revisionId: string; revisionNumber: number }
  | { kind: 'not_found' }
  | { kind: 'run_not_found' }
  | { kind: 'run_not_acceptable' };

/** Saves a planning run's itinerary as the trip's next accepted revision. */
export async function acceptRevision(db: AppDb, ownerId: string, tripId: string, runId: string): Promise<AcceptResult> {
  if (!(await findOwned(db, ownerId, tripId))) return { kind: 'not_found' };
  const [run] = await db.select().from(planningRun).where(and(eq(planningRun.id, runId), eq(planningRun.tripId, tripId)));
  if (!run) return { kind: 'run_not_found' };
  const result = run.resultJson as StoredPlanResult | null;
  if (run.status === 'failed' || !result?.days?.length) return { kind: 'run_not_acceptable' };
  return db.transaction(async tx => {
    const [latest] = await tx.select({ n: sql<number>`coalesce(max(${tripRevision.revisionNumber}), 0)` }).from(tripRevision).where(eq(tripRevision.tripId, tripId));
    const revisionNumber = Number(latest.n) + 1;
    const [revision] = await tx.insert(tripRevision).values({ tripId, planningRunId: runId, revisionNumber }).returning({ id: tripRevision.id });
    await tx.insert(daySegment).values(result.days.map(segment => {
      const row = daySegmentToRow(revision.id, segment);
      return {
        tripRevisionId: row.trip_revision_id,
        dayNumber: row.day_number,
        activities: row.activities,
        routes: row.routes,
        transportLegs: row.transport_legs,
        startingFrom: row.starting_from,
        endingAt: row.ending_at,
        snapshotJson: row.snapshot_json,
        eventsJson: row.events_json,
      };
    }));
    await tx.update(trip).set({ status: 'accepted', updatedAt: new Date() }).where(and(eq(trip.id, tripId), eq(trip.ownerId, ownerId)));
    return { kind: 'ok' as const, revisionId: revision.id, revisionNumber };
  });
}

/** Candidates are not stored separately; the segment's event log carries the place list. */
export function placesFromSegment(segment: Pick<DaySegmentRecord, 'eventsJson'>): Place[] {
  const events = (segment.eventsJson as { candidates?: Place[] }[] | null) ?? [];
  return events.find(event => event.candidates?.length)?.candidates ?? [];
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function getOrCreateProfile(db: AppDb, userId: string) {
  await db.insert(userProfile).values({ id: userId }).onConflictDoNothing();
  const [profile] = await db.select().from(userProfile).where(eq(userProfile.id, userId));
  return profile;
}

export async function updateProfile(db: AppDb, userId: string, patch: { displayName?: string | null; themePreference?: 'light' | 'dark' | 'system' }) {
  await getOrCreateProfile(db, userId);
  const [profile] = await db.update(userProfile).set({
    ...(patch.displayName !== undefined && { displayName: patch.displayName }),
    ...(patch.themePreference !== undefined && { themePreference: patch.themePreference }),
    updatedAt: new Date(),
  }).where(eq(userProfile.id, userId)).returning();
  return profile;
}
