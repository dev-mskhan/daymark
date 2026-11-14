import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDb } from '@/lib/db';
import type { DaySegment } from '@/lib/domain';
import { createAuthUser, createTestDatabase, type TestClient } from '@/lib/db/testing';
import {
  acceptRevision, archiveTrip, createTrip, deleteTrip, duplicateTrip, getOrCreateProfile, getTripDetail,
  listTrips, placesFromSegment, savePlanningRun, updateProfile, updateTrip, type StoredPlanResult,
} from './repository';
import type { CreateTripInput } from './schemas';

let db: AppDb;
let client: TestClient;
let alice: string;
let bob: string;

beforeAll(async () => {
  ({ db, client } = await createTestDatabase());
  alice = await createAuthUser(client, 'alice@example.com');
  bob = await createAuthUser(client, 'bob@example.com');
}, 60_000);
afterAll(() => client.close());

const day = (dayNumber: number, date: string) => ({ dayNumber, date, startTime: '09:00', endTime: '19:00' });
const input = (overrides: Partial<CreateTripInput> = {}): CreateTripInput => ({
  title: 'NYC long weekend', destination: 'New York City', origin: 'Penn Station', partySize: 2,
  preference: 'Art and food', constraints: '', mode: 'fixture', days: [day(1, '2026-10-12'), day(2, '2026-10-13')], ...overrides,
});
const segment = (dayNumber: number): DaySegment => ({
  dayNumber, startingFrom: dayNumber === 1 ? 'Penn Station' : 'Hotel', endingAt: dayNumber === 1 ? 'Hotel' : undefined,
  snapshot: { version: 1, activities: [{ id: 'activity-1', placeId: 'demo-1', durationMinutes: 60, reason: 'x' }], routes: [], issues: [] },
  candidates: [], events: [{ sequence: 1, elapsedMs: 0, type: 'candidates', actor: 'Controller', message: 'm', candidates: [{ id: 'demo-1', name: 'The High Line', address: '', latitude: 40.7, longitude: -74, types: [], source: 'demo' }] }],
});
const result = (): StoredPlanResult => ({ status: 'complete', days: [segment(1), segment(2)] });

describe('trip lifecycle', () => {
  it('creates a multi-day trip with ordered day boundaries', async () => {
    const detail = await createTrip(db, alice, input({ days: [day(2, '2026-10-13'), day(1, '2026-10-12')] }));
    expect(detail.trip).toMatchObject({ ownerId: alice, status: 'draft', partySize: 2 });
    expect(detail.days.map(d => d.dayNumber)).toEqual([1, 2]);
  });

  it('updates fields and replaces day boundaries', async () => {
    const { trip } = await createTrip(db, alice, input());
    const updated = await updateTrip(db, alice, trip.id, { title: 'Renamed', days: [day(1, '2026-11-01')] });
    expect(updated.kind).toBe('ok');
    if (updated.kind === 'ok') {
      expect(updated.detail.trip.title).toBe('Renamed');
      expect(updated.detail.days).toHaveLength(1);
    }
  });

  it('plans, accepts revisions, and reloads the multi-day structure', async () => {
    const { trip } = await createTrip(db, alice, input());
    const runId = (await savePlanningRun(db, alice, trip.id, { mode: 'fixture', status: 'complete', events: [], result: result() }))!;
    expect((await getTripDetail(db, alice, trip.id))!.trip.status).toBe('planned');

    const first = await acceptRevision(db, alice, trip.id, runId);
    const second = await acceptRevision(db, alice, trip.id, runId);
    expect(first).toMatchObject({ kind: 'ok', revisionNumber: 1 });
    expect(second).toMatchObject({ kind: 'ok', revisionNumber: 2 });

    const detail = (await getTripDetail(db, alice, trip.id))!;
    expect(detail.trip.status).toBe('accepted');
    expect(detail.latestRevision?.revisionNumber).toBe(2);
    expect(detail.latestRevision?.segments.map(s => [s.dayNumber, s.startingFrom, s.endingAt])).toEqual([[1, 'Penn Station', 'Hotel'], [2, 'Hotel', null]]);
    expect(placesFromSegment(detail.latestRevision!.segments[0])[0].name).toBe('The High Line');
  });

  it('refuses to accept failed or empty runs', async () => {
    const { trip } = await createTrip(db, alice, input());
    const failed = (await savePlanningRun(db, alice, trip.id, { mode: 'fixture', status: 'failed', events: [], errorMessage: 'boom' }))!;
    expect(await acceptRevision(db, alice, trip.id, failed)).toEqual({ kind: 'run_not_acceptable' });
    expect((await getTripDetail(db, alice, trip.id))!.trip.status).toBe('draft');
  });

  it('duplicates inputs and days as a fresh draft without plans', async () => {
    const { trip } = await createTrip(db, alice, input());
    const runId = (await savePlanningRun(db, alice, trip.id, { mode: 'fixture', status: 'complete', events: [], result: result() }))!;
    await acceptRevision(db, alice, trip.id, runId);
    const copy = (await duplicateTrip(db, alice, trip.id))!;
    expect(copy.trip.id).not.toBe(trip.id);
    expect(copy.trip).toMatchObject({ title: 'Copy of NYC long weekend', status: 'draft' });
    expect(copy.days).toHaveLength(2);
    expect(copy.latestRevision).toBeNull();
  });

  it('archives (hidden from the default list, no longer editable) and deletes', async () => {
    const { trip } = await createTrip(db, alice, input({ title: 'To archive' }));
    await archiveTrip(db, alice, trip.id);
    expect((await listTrips(db, alice)).some(t => t.id === trip.id)).toBe(false);
    expect((await listTrips(db, alice, { includeArchived: true })).some(t => t.id === trip.id)).toBe(true);
    expect(await updateTrip(db, alice, trip.id, { title: 'x' })).toEqual({ kind: 'archived' });
    expect(await deleteTrip(db, alice, trip.id)).toBe(true);
    expect(await getTripDetail(db, alice, trip.id)).toBeNull();
  });
});

describe('ownership isolation (code-level defense; the server role bypasses RLS)', () => {
  it("never exposes or mutates another user's trip", async () => {
    const { trip } = await createTrip(db, alice, input({ title: 'Private' }));
    const runId = (await savePlanningRun(db, alice, trip.id, { mode: 'fixture', status: 'complete', events: [], result: result() }))!;

    expect(await getTripDetail(db, bob, trip.id)).toBeNull();
    expect((await listTrips(db, bob)).some(t => t.id === trip.id)).toBe(false);
    expect(await updateTrip(db, bob, trip.id, { title: 'hacked' })).toEqual({ kind: 'not_found' });
    expect(await archiveTrip(db, bob, trip.id)).toBeNull();
    expect(await duplicateTrip(db, bob, trip.id)).toBeNull();
    expect(await deleteTrip(db, bob, trip.id)).toBe(false);
    expect(await savePlanningRun(db, bob, trip.id, { mode: 'fixture', status: 'complete', events: [] })).toBeNull();
    expect(await acceptRevision(db, bob, trip.id, runId)).toEqual({ kind: 'not_found' });

    const intact = (await getTripDetail(db, alice, trip.id))!;
    expect(intact.trip).toMatchObject({ title: 'Private', status: 'planned' });
  });

  it("does not accept a run id that belongs to a different trip", async () => {
    const a = await createTrip(db, alice, input());
    const b = await createTrip(db, alice, input());
    const runOfA = (await savePlanningRun(db, alice, a.trip.id, { mode: 'fixture', status: 'complete', events: [], result: result() }))!;
    expect(await acceptRevision(db, alice, b.trip.id, runOfA)).toEqual({ kind: 'run_not_found' });
  });
});

describe('profile', () => {
  it('creates a default profile and stores the theme preference per user', async () => {
    expect((await getOrCreateProfile(db, alice)).themePreference).toBe('system');
    expect((await updateProfile(db, alice, { themePreference: 'dark', displayName: 'Alice' }))).toMatchObject({ themePreference: 'dark', displayName: 'Alice' });
    expect((await getOrCreateProfile(db, bob)).themePreference).toBe('system');
  });
});
