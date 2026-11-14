import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asAnonymous, asUser, createAuthUser, createTestDatabase, type TestClient } from './testing';

let client: TestClient;
let alice: string;
let bob: string;
let aliceTrip: string;
let aliceRun: string;
let aliceRevision: string;

const insertTrip = (tx: TestClient, owner: string, title = 'NYC') =>
  tx.query<{ id: string }>(
    `insert into trip (owner_id, title, destination, preference) values ($1, $2, 'New York City', 'Art') returning id`,
    [owner, title],
  );

beforeAll(async () => {
  ({ client } = await createTestDatabase());
  alice = await createAuthUser(client, 'alice@example.com');
  bob = await createAuthUser(client, 'bob@example.com');
  aliceTrip = (await asUser(client, alice, tx => insertTrip(tx, alice))).rows[0].id;
  aliceRun = (await asUser(client, alice, tx => tx.query<{ id: string }>(
    `insert into planning_run (trip_id, mode, status, events_json) values ($1, 'fixture', 'complete', '[]') returning id`, [aliceTrip],
  ))).rows[0].id;
  aliceRevision = (await asUser(client, alice, tx => tx.query<{ id: string }>(
    `insert into trip_revision (trip_id, planning_run_id, revision_number) values ($1, $2, 1) returning id`, [aliceTrip, aliceRun],
  ))).rows[0].id;
  await asUser(client, alice, async tx => {
    await tx.query(`insert into day_boundary (trip_id, day_number, date, start_time, end_time) values ($1, 1, '2026-10-12', '09:00', '19:00')`, [aliceTrip]);
    await tx.query(
      `insert into day_segment (trip_revision_id, day_number, activities, routes, starting_from, snapshot_json) values ($1, 1, '[]', '[]', 'Penn Station', '{}')`, [aliceRevision],
    );
    await tx.query(`insert into user_profile (id, display_name) values ($1, 'Alice')`, [alice]);
  });
}, 60_000);

afterAll(() => client.close());

const count = async (tx: TestClient, table: string) =>
  Number((await tx.query<{ n: string }>(`select count(*)::text as n from ${table}`)).rows[0].n);

describe('migration', () => {
  it('enables row level security on every application table', async () => {
    const result = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(result.rows.map(row => row.relname).sort()).toEqual(
      ['day_boundary', 'day_segment', 'planning_run', 'trip', 'trip_revision', 'user_profile'],
    );
    expect(result.rows.every(row => row.relrowsecurity)).toBe(true);
  });

  it('rejects invalid day numbers and party sizes at the database', async () => {
    await expect(client.query(`insert into day_boundary (trip_id, day_number, date, start_time, end_time) values ($1, 8, '2026-10-20', '09:00', '19:00')`, [aliceTrip])).rejects.toThrow();
    await expect(client.query(`insert into trip (owner_id, title, destination, preference, party_size) values ($1, 'x', 'y', 'z', 0)`, [alice])).rejects.toThrow();
  });
});

describe('RLS ownership isolation', () => {
  it('lets owners read their own rows in every table', async () => {
    await asUser(client, alice, async tx => {
      for (const table of ['trip', 'day_boundary', 'planning_run', 'trip_revision', 'day_segment', 'user_profile'])
        expect(await count(tx, table), table).toBe(1);
    });
  });

  it("hides another user's rows in every table", async () => {
    await asUser(client, bob, async tx => {
      for (const table of ['trip', 'day_boundary', 'planning_run', 'trip_revision', 'day_segment', 'user_profile'])
        expect(await count(tx, table), table).toBe(0);
    });
  });

  it('denies anonymous access', async () => {
    await expect(asAnonymous(client, tx => tx.query('select * from trip'))).rejects.toThrow(/permission denied/);
  });

  it("blocks writes against another user's trip", async () => {
    await asUser(client, bob, async tx => {
      expect((await tx.query(`update trip set title = 'hacked' where id = $1 returning id`, [aliceTrip])).rows).toHaveLength(0);
      expect((await tx.query(`delete from trip where id = $1 returning id`, [aliceTrip])).rows).toHaveLength(0);
    });
    expect((await client.query<{ title: string }>('select title from trip where id = $1', [aliceTrip])).rows[0].title).toBe('NYC');
  });

  it('prevents creating rows that belong to someone else', async () => {
    await expect(asUser(client, bob, tx => insertTrip(tx, alice))).rejects.toThrow(/row-level security/);
    await expect(asUser(client, bob, tx => tx.query(
      `insert into day_boundary (trip_id, day_number, date, start_time, end_time) values ($1, 2, '2026-10-13', '09:00', '19:00')`, [aliceTrip],
    ))).rejects.toThrow(/row-level security/);
    await expect(asUser(client, bob, tx => tx.query(
      `insert into trip_revision (trip_id, revision_number) values ($1, 2)`, [aliceTrip],
    ))).rejects.toThrow(/row-level security/);
    await expect(asUser(client, bob, tx => tx.query(
      `insert into day_segment (trip_revision_id, day_number, activities, routes, starting_from, snapshot_json) values ($1, 2, '[]', '[]', 'x', '{}')`, [aliceRevision],
    ))).rejects.toThrow(/row-level security/);
    await expect(asUser(client, bob, tx => tx.query(
      `insert into planning_run (trip_id, mode, status, events_json) values ($1, 'fixture', 'complete', '[]')`, [aliceTrip],
    ))).rejects.toThrow(/row-level security/);
  });

  it("prevents a user from impersonating another user's profile", async () => {
    await expect(asUser(client, bob, tx => tx.query(`insert into user_profile (id) values ($1)`, [alice]))).rejects.toThrow(/row-level security/);
  });

  it('rejects revisions linked to a planning run from a different trip', async () => {
    const otherTrip = (await asUser(client, alice, tx => insertTrip(tx, alice, 'Other trip'))).rows[0].id;
    const otherRun = (await asUser(client, alice, tx => tx.query<{ id: string }>(
      `insert into planning_run (trip_id, mode, status, events_json) values ($1, 'fixture', 'complete', '[]') returning id`, [otherTrip],
    ))).rows[0].id;
    const bobTrip = (await asUser(client, bob, tx => insertTrip(tx, bob))).rows[0].id;
    const bobRun = (await asUser(client, bob, tx => tx.query<{ id: string }>(
      `insert into planning_run (trip_id, mode, status, events_json) values ($1, 'fixture', 'complete', '[]') returning id`, [bobTrip],
    ))).rows[0].id;

    for (const runId of [otherRun, bobRun]) {
      await expect(asUser(client, alice, tx => tx.query(
        `insert into trip_revision (trip_id, planning_run_id, revision_number) values ($1, $2, 2)`, [aliceTrip, runId],
      ))).rejects.toThrow(/row-level security/);
      await expect(asUser(client, alice, tx => tx.query(
        `update trip_revision set planning_run_id = $1 where id = $2`, [runId, aliceRevision],
      ))).rejects.toThrow(/row-level security/);
    }
  });

  it('keeps planning runs immutable for their owner', async () => {
    await asUser(client, alice, async tx => {
      expect((await tx.query(`update planning_run set status = 'failed' where id = $1 returning id`, [aliceRun])).rows).toHaveLength(0);
      expect((await tx.query(`delete from planning_run where id = $1 returning id`, [aliceRun])).rows).toHaveLength(0);
    });
    expect((await client.query<{ status: string }>('select status from planning_run where id = $1', [aliceRun])).rows[0].status).toBe('complete');
  });

  it('cascades trip deletion to dependent rows for the owner', async () => {
    const trip = (await asUser(client, alice, tx => insertTrip(tx, alice, 'Disposable'))).rows[0].id;
    await asUser(client, alice, tx => tx.query(`insert into day_boundary (trip_id, day_number, date, start_time, end_time) values ($1, 1, '2026-11-01', '09:00', '19:00')`, [trip]));
    await asUser(client, alice, tx => tx.query('delete from trip where id = $1', [trip]));
    expect(Number((await client.query<{ n: string }>('select count(*)::text as n from day_boundary where trip_id = $1', [trip])).rows[0].n)).toBe(0);
  });
});
