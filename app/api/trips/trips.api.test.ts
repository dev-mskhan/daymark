import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDb } from '@/lib/db';
import { createAuthUser, createTestDatabase, type TestClient } from '@/lib/db/testing';

const state = vi.hoisted(() => ({ user: null as { id: string; email: string | null } | null, db: null as unknown }));

vi.mock('@/lib/auth/server', async () => {
  const { ApiError } = await import('@/lib/api/errors');
  return { requireUser: async () => { if (!state.user) throw new ApiError('unauthenticated', 'Please sign in to continue.'); return state.user; } };
});
vi.mock('@/lib/db', () => ({ DatabaseConfigError: class extends Error {}, getDb: () => state.db as AppDb }));

import * as tripsRoute from './route';
import * as tripRoute from './[id]/route';
import * as planRoute from './[id]/plan/route';
import * as acceptRoute from './[id]/accept/route';
import * as duplicateRoute from './[id]/duplicate/route';
import * as archiveRoute from './[id]/archive/route';
import * as exportRoute from './[id]/export/route';
import * as profileRoute from '../profile/route';
import * as placesGeocodeRoute from '../places/geocode/route';

let client: TestClient;
let alice: { id: string; email: string };
let bob: { id: string; email: string };

beforeAll(async () => {
  const created = await createTestDatabase();
  client = created.client;
  state.db = created.db;
  alice = { id: await createAuthUser(client, 'alice@example.com'), email: 'alice@example.com' };
  bob = { id: await createAuthUser(client, 'bob@example.com'), email: 'bob@example.com' };
}, 60_000);
afterAll(() => client.close());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
beforeEach(() => { state.user = alice; });

const ctx = (id?: string) => ({ params: Promise.resolve(id ? { id } : {}) });
const json = (url: string, method: string, body?: unknown) =>
  new Request(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
const tripBody = (extra: object = {}) => ({
  title: 'NYC weekend', destination: 'New York City', origin: 'Penn Station, New York City', preference: 'Art and food', mode: 'fixture',
  days: [{ dayNumber: 1, date: '2026-10-12', startTime: '09:00', endTime: '19:00' }, { dayNumber: 2, date: '2026-10-13', startTime: '09:00', endTime: '19:00' }], ...extra,
});
async function createTrip(extra: object = {}) {
  const response = await tripsRoute.POST(json('/api/trips', 'POST', tripBody(extra)), ctx());
  expect(response.status).toBe(201);
  return (await response.json()).trip.trip.id as string;
}

describe('authentication', () => {
  it('rejects unauthenticated requests on every trip endpoint with 401', async () => {
    state.user = null;
    const id = '00000000-0000-4000-8000-000000000000';
    const calls = [
      tripsRoute.GET(json('/api/trips', 'GET'), ctx()),
      tripsRoute.POST(json('/api/trips', 'POST', tripBody()), ctx()),
      tripRoute.GET(json('/x', 'GET'), ctx(id)),
      tripRoute.PATCH(json('/x', 'PATCH', {}), ctx(id)),
      tripRoute.DELETE(json('/x?confirm=true', 'DELETE'), ctx(id)),
      planRoute.POST(json('/x', 'POST'), ctx(id)),
      acceptRoute.POST(json('/x', 'POST', {}), ctx(id)),
      duplicateRoute.POST(json('/x', 'POST'), ctx(id)),
      archiveRoute.POST(json('/x', 'POST'), ctx(id)),
      exportRoute.GET(json('/x', 'GET'), ctx(id)),
      profileRoute.GET(json('/x', 'GET'), ctx()),
      placesGeocodeRoute.POST(json('/api/places/geocode', 'POST', { query: 'Penn Station, New York' }), ctx()),
    ];
    for (const response of await Promise.all(calls)) {
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe('unauthenticated');
    }
  });
});

describe('validation and error handling', () => {
  it('returns friendly 400s for invalid input', async () => {
    const bad = await tripsRoute.POST(json('/api/trips', 'POST', tripBody({ partySize: 99 })), ctx());
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toContain('partySize');
    expect((await tripsRoute.POST(json('/api/trips', 'POST', tripBody({ days: [{ dayNumber: 1, date: '2026-10-12', startTime: '19:00', endTime: '09:00' }] })), ctx())).status).toBe(400);
    expect((await tripsRoute.POST(json('/api/trips', 'POST', tripBody({ days: [{ dayNumber: 1, date: '2026-10-12', startTime: '09:00', endTime: '10:00' }, { dayNumber: 1, date: '2026-10-13', startTime: '09:00', endTime: '10:00' }] })), ctx())).status).toBe(400);
    const malformed = await tripsRoute.POST(new Request('http://localhost/api/trips', { method: 'POST', body: '{nope' }), ctx());
    expect(malformed.status).toBe(400);
  });

  it('ignores identity supplied in the body by rejecting unknown fields', async () => {
    const response = await tripsRoute.POST(json('/api/trips', 'POST', tripBody({ ownerId: bob.id })), ctx());
    expect(response.status).toBe(400);
  });

  it("assigns the session user as owner regardless of the request", async () => {
    const id = await createTrip();
    const rows = await client.query<{ owner_id: string }>('select owner_id from trip where id = $1', [id]);
    expect(rows.rows[0].owner_id).toBe(alice.id);
  });

  it('treats malformed trip ids as not found', async () => {
    expect((await tripRoute.GET(json('/x', 'GET'), ctx('not-a-uuid'))).status).toBe(404);
  });

  it('requires explicit confirmation to delete', async () => {
    const id = await createTrip();
    expect((await tripRoute.DELETE(json('/x', 'DELETE'), ctx(id))).status).toBe(400);
    expect((await tripRoute.DELETE(json('/x?confirm=true', 'DELETE'), ctx(id))).status).toBe(204);
    expect((await tripRoute.GET(json('/x', 'GET'), ctx(id))).status).toBe(404);
  });
});

describe('overnight location geocoding', () => {
  it('returns a server-geocoded place without exposing the provider key', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [{
          properties: {
            lat: 40.7506,
            lon: -73.9935,
            formatted: 'Pennsylvania Station, New York, NY, USA',
            rank: { confidence: 0.95 },
          },
        }],
      }),
    );

    const response = await placesGeocodeRoute.POST(
      json('/api/places/geocode', 'POST', { query: 'Penn Station, New York' }),
      ctx(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      confidence: 'high',
      place: {
        name: 'Penn Station, New York',
        address: 'Pennsylvania Station, New York, NY, USA',
        latitude: 40.7506,
        longitude: -73.9935,
        source: 'geoapify',
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.geoapify.com/v1/geocode/search'),
      expect.any(Object),
    );
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects low-confidence matches rather than saving a guessed overnight stop', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-key');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        features: [{
          properties: {
            lat: 40.7506,
            lon: -73.9935,
            formatted: 'Penn Station area',
            rank: { confidence: 0.3 },
          },
        }],
      }),
    );

    const response = await placesGeocodeRoute.POST(
      json('/api/places/geocode', 'POST', { query: 'somewhere near Penn Station' }),
      ctx(),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('more specific address');
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });
});

describe('ownership isolation through the API', () => {
  it("returns 404 for every operation on another user's trip and changes nothing", async () => {
    const id = await createTrip({ title: 'Alice only' });
    state.user = bob;
    expect((await tripRoute.GET(json('/x', 'GET'), ctx(id))).status).toBe(404);
    expect((await tripRoute.PATCH(json('/x', 'PATCH', { title: 'hacked' }), ctx(id))).status).toBe(404);
    expect((await tripRoute.DELETE(json('/x?confirm=true', 'DELETE'), ctx(id))).status).toBe(404);
    expect((await planRoute.POST(json('/x', 'POST'), ctx(id))).status).toBe(404);
    expect((await acceptRoute.POST(json('/x', 'POST', { planningRunId: id }), ctx(id))).status).toBe(404);
    expect((await duplicateRoute.POST(json('/x', 'POST'), ctx(id))).status).toBe(404);
    expect((await archiveRoute.POST(json('/x', 'POST'), ctx(id))).status).toBe(404);
    expect((await exportRoute.GET(json('/x', 'GET'), ctx(id))).status).toBe(404);
    const list = await (await tripsRoute.GET(json('/api/trips', 'GET'), ctx())).json();
    expect(list.trips.some((t: { id: string }) => t.id === id)).toBe(false);

    state.user = alice;
    const intact = await (await tripRoute.GET(json('/x', 'GET'), ctx(id))).json();
    expect(intact.trip.trip.title).toBe('Alice only');
  });
});

describe('trip lifecycle through the API', () => {
  it('stores the provided overnight coordinates as part of the day boundary', async () => {
    const overnightPlace = {
      id: 'demo-overnight-1',
      name: 'Demo Hotel Midtown',
      address: 'New York City',
      latitude: 40.758,
      longitude: -73.985,
      types: ['accommodation'],
      source: 'demo',
    };
    const response = await tripsRoute.POST(
      json('/api/trips', 'POST', tripBody({
        days: [{
          dayNumber: 1,
          date: '2026-10-12',
          startTime: '10:00',
          endTime: '18:00',
          overnightPlace,
        }],
      })),
      ctx(),
    );
    expect(response.status).toBe(201);
    const created = (await response.json()).trip;
    expect(created.days[0]).toMatchObject({
      dayNumber: 1,
      startTime: '10:00:00',
      endTime: '18:00:00',
      overnightPlaceData: overnightPlace,
    });
  });

  it('plans, accepts, retrieves, and exports a single-day trip', async () => {
    const id = await createTrip({
      days: [{ dayNumber: 1, date: '2026-10-12', startTime: '09:00', endTime: '19:00' }],
    });
    const planResponse = await planRoute.POST(json('/x', 'POST'), ctx(id));
    expect(planResponse.status).toBe(200);
    const events = (await planResponse.text()).trim().split('\n').map(line => JSON.parse(line));
    expect(events.filter(event => event.type === 'day_start')).toHaveLength(1);
    const saved = events.at(-1);
    expect(saved).toMatchObject({ type: 'saved' });

    const accepted = await acceptRoute.POST(json('/x', 'POST', { planningRunId: saved.runId }), ctx(id));
    expect(accepted.status).toBe(201);
    const detail = (await (await tripRoute.GET(json('/x', 'GET'), ctx(id))).json()).trip;
    expect(detail.latestRevision.segments).toHaveLength(1);
    const exported = (await (await exportRoute.GET(json('/x', 'GET'), ctx(id))).json()).export;
    expect(exported.days).toHaveLength(1);
    expect(exported.days[0].stops.length).toBeGreaterThan(0);
  }, 60_000);

  it('plans, accepts, retrieves, and exports all three days of a trip', async () => {
    const id = await createTrip({
      days: [
        { dayNumber: 1, date: '2026-10-12', startTime: '09:00', endTime: '19:00' },
        { dayNumber: 2, date: '2026-10-13', startTime: '09:00', endTime: '19:00' },
        { dayNumber: 3, date: '2026-10-14', startTime: '09:00', endTime: '19:00' },
      ],
    });
    const planResponse = await planRoute.POST(json('/x', 'POST'), ctx(id));
    expect(planResponse.status).toBe(200);
    const events = (await planResponse.text()).trim().split('\n').map(line => JSON.parse(line));
    expect(events.filter(event => event.type === 'day_start')).toHaveLength(3);
    const saved = events.at(-1);
    expect(saved).toMatchObject({ type: 'saved' });

    const accepted = await acceptRoute.POST(json('/x', 'POST', { planningRunId: saved.runId }), ctx(id));
    expect(accepted.status).toBe(201);
    const detail = (await (await tripRoute.GET(json('/x', 'GET'), ctx(id))).json()).trip;
    expect(detail.latestRevision.segments).toHaveLength(3);
    const exported = (await (await exportRoute.GET(json('/x', 'GET'), ctx(id))).json()).export;
    expect(exported.days).toHaveLength(3);
    expect(exported.days.every((day: { stops: unknown[] }) => day.stops.length > 0)).toBe(true);
  }, 90_000);

  it('plans a multi-day trip, streams events, saves the run, accepts it, and exports it', async () => {
    const id = await createTrip();
    const planResponse = await planRoute.POST(json('/x', 'POST'), ctx(id));
    expect(planResponse.status).toBe(200);
    const events = (await planResponse.text()).trim().split('\n').map(line => JSON.parse(line));
    expect(events.filter(event => event.type === 'day_start')).toHaveLength(2);
    const saved = events.at(-1);
    expect(saved).toMatchObject({ type: 'saved' });

    const accepted = await acceptRoute.POST(json('/x', 'POST', { planningRunId: saved.runId }), ctx(id));
    expect(accepted.status).toBe(201);
    expect((await accepted.json()).revisionNumber).toBe(1);

    const detail = (await (await tripRoute.GET(json('/x', 'GET'), ctx(id))).json()).trip;
    expect(detail.trip.status).toBe('accepted');
    expect(detail.latestRevision.segments).toHaveLength(2);

    const exported = (await (await exportRoute.GET(json('/x', 'GET'), ctx(id))).json()).export;
    expect(exported.days).toHaveLength(2);
    expect(exported.days[0].stops[0].verification.length).toBeGreaterThan(0);

    const markdown = await exportRoute.GET(json('/x?format=markdown', 'GET'), ctx(id));
    expect(markdown.headers.get('content-type')).toContain('text/markdown');
    expect(await markdown.text()).toContain('## Day 1');
  }, 60_000);

  it('requires days before planning and refuses to plan archived trips', async () => {
    const noDays = await createTrip({ days: [] });
    expect((await planRoute.POST(json('/x', 'POST'), ctx(noDays))).status).toBe(400);
    const archived = await createTrip();
    expect((await archiveRoute.POST(json('/x', 'POST'), ctx(archived))).status).toBe(200);
    expect((await planRoute.POST(json('/x', 'POST'), ctx(archived))).status).toBe(409);
    expect((await tripRoute.PATCH(json('/x', 'PATCH', { title: 'x' }), ctx(archived))).status).toBe(409);
  });

  it('duplicates a trip as a new draft', async () => {
    const id = await createTrip();
    const response = await duplicateRoute.POST(json('/x', 'POST'), ctx(id));
    expect(response.status).toBe(201);
    const copy = (await response.json()).trip;
    expect(copy.trip.id).not.toBe(id);
    expect(copy.days).toHaveLength(2);
  });
});

describe('profile', () => {
  it('stores the theme preference for the signed-in user only', async () => {
    const update = await profileRoute.PATCH(json('/api/profile', 'PATCH', { themePreference: 'dark' }), ctx());
    expect((await update.json()).profile.themePreference).toBe('dark');
    state.user = bob;
    expect((await (await profileRoute.GET(json('/api/profile', 'GET'), ctx())).json()).profile.themePreference).toBe('system');
    expect((await profileRoute.PATCH(json('/api/profile', 'PATCH', { themePreference: 'purple' }), ctx())).status).toBe(400);
  });
});
