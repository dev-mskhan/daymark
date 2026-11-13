import { afterEach, describe, expect, it, vi } from 'vitest';
import { RoutesProvider } from './providers/routes';
import { PlannerProvider } from './providers/planner';
import { JevProvider } from './providers/jev';
afterEach(() => vi.restoreAllMocks());
import { planTrip, validateProposal } from './planner';
import type { RunEvent, TripRequest } from './domain';
const request: TripRequest = { destination: 'Tokyo', startAt: '2026-10-12T09:00:00', endAt: '2026-10-12T19:00:00', preference: 'Art, food and local neighborhoods; avoid repetitive museums.', mode: 'fixture' };
describe('collaborative planner', () => {
  it('flags repetition, discards speculation, repairs and rechecks a newer version', async () => {
    const result = await planTrip(request);
    const diff = result.events.find(e => e.type === 'repair_diff')!;
    expect(diff).toBeDefined();
    expect(result.events.some(e => e.type === 'discard')).toBe(true);
    expect(result.events.some(e => e.review && e.review.version > diff.version! && e.review.status === 'pass')).toBe(true);
    expect(result.snapshot.activities.some(a => a.placeId === 'demo-3')).toBe(true);
    expect(result.snapshot.issues.filter(i => i.status === 'flag')).toHaveLength(0);
    expect(result.events.every((e, i) => e.sequence === i + 1)).toBe(true);
  });
  it('starts the next proposal before the current review finishes', async () => {
    const { events } = await planTrip(request);
    const start = events.findIndex(e => e.type === 'review_start');
    const end = events.findIndex(e => e.type === 'review_end');
    expect(events.slice(start + 1, end).some(e => e.type === 'planning_start')).toBe(true);
  });
  it('allows one typed Jev query and then resumes planning on the same version', async () => {
    const result = await planTrip(request);
    const start = result.events.find(e => e.type === 'jev_query_start')!;
    const end = result.events.find(e => e.type === 'jev_query_end')!;
    expect(start.version).toBe(end.version);
    expect(end.decisions).toHaveLength(2);
    expect(end.decisions?.every(decision => decision.dimension === 'preference_fit')).toBe(true);
    expect(result.events.slice(result.events.indexOf(end) + 1).some(e => e.type === 'proposal' && e.version === end.version)).toBe(true);
  });
  it('stores the Jev-selected transport option on each committed leg', async () => {
    const result = await planTrip(request);
    expect(result.snapshot.transportLegs).toHaveLength(result.snapshot.activities.length - 1);
    expect(result.snapshot.transportLegs?.every(leg => leg.selected?.mode === 'transit')).toBe(true);
    expect(result.events.some(event => event.type === 'transport_selection' && event.transportSelection)).toBe(true);
    const selections = result.events.filter(event => event.type === 'transport_selection').map(event => event.message);
    expect(new Set(selections).size).toBe(selections.length);
  });
  it('stops no-change repairs with visible hard time conflicts', async () => {
    const result = await planTrip({ ...request, endAt: '2026-10-12T09:30:00' });
    expect(result.snapshot.issues.some(i => i.checkId === 'time_window')).toBe(true);
    expect(result.events.some(e => e.type === 'stopped')).toBe(true);
  });
  it('rejects invented candidate IDs', () => {
    expect(() => validateProposal({ activities: [{ id: 'a', placeId: 'invented', durationMinutes: 60, reason: 'x' }], done: true }, [], [], false)).toThrow('候选池');
  });
  it('cancels without emitting later versions', async () => {
    const controller = new AbortController(); const events: RunEvent[] = [];
    await expect(planTrip(request, e => { events.push(e); if (e.type === 'snapshot') controller.abort(); }, controller.signal)).rejects.toThrow();
    expect(events.filter(e => e.type === 'snapshot')).toHaveLength(1);
  });
});

it('keeps missing routes unknown, never zero', async () => {
  vi.spyOn(RoutesProvider.prototype, 'options').mockRejectedValue(new Error('route unavailable'));
  const result = await planTrip(request);
  expect(result.snapshot.routes).toContain(null);
  expect(result.snapshot.issues.some(i => i.checkId === 'route_unknown' && i.status === 'unknown')).toBe(true);
  expect(result.status).toBe('needs_attention');
});
it('keeps a prior committed draft when later model output fails twice', async () => {
  const original = PlannerProvider.prototype.propose;
  vi.spyOn(PlannerProvider.prototype, 'propose').mockImplementation(function (this: PlannerProvider, ...args) {
    if (args[2].length) return Promise.reject(new Error('invalid JSON'));
    return original.apply(this, args);
  });
  const events: RunEvent[] = [];
  await expect(planTrip(request, e => events.push(e))).rejects.toThrow('invalid JSON');
  expect(events.filter(e => e.type === 'snapshot').at(-1)?.snapshot?.activities).toHaveLength(1);
  expect(events.some(e => e.type === 'retry')).toBe(true);
});
it('does not turn an incomplete Jev response into a pass', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({model:'test',answers:{}}));
  const result = await new JevProvider(false).review(request, [], [], 1, 'local', new AbortController().signal);
  expect(result.status).toBe('unknown');
  expect(result.issues[0].checkId).toBe('review_unavailable');
  fetchMock.mockRestore(); vi.unstubAllEnvs();
});
it('screens only multi-day, multi-city, and transaction requests before planning', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({model:'jev-test',answers:{
    multi_day:{choice:'pass',confidence:.95,probabilities:{pass:.95,flag:.03,unknown:.02}},
    multi_city:{choice:'unknown',confidence:.6,probabilities:{pass:.2,flag:.2,unknown:.6}},
    booking_or_transaction:{choice:'flag',confidence:.9,probabilities:{pass:.05,flag:.9,unknown:.05}},
  }}));
  const screening = await new JevProvider(false).screenRequest({...request,preference:'安排三个景点，并帮我订晚餐'},new AbortController().signal);
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(Object.keys(body.questions)).toEqual(['multi_day','multi_city','booking_or_transaction']);
  expect(body.questions.multi_day.instructions).toContain('not isolated numbers');
  expect(screening).toMatchObject({model:'jev-test',answers:{multi_day:{choice:'pass'},multi_city:{choice:'unknown'},booking_or_transaction:{choice:'flag'}}});
  vi.unstubAllEnvs();
});
it('does not trigger repair from a low-confidence Jev flag', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({model:'test',answers:{
    'repetition:a':{choice:'pass',confidence:.9,probabilities:{pass:.9,flag:.1,unknown:0}},
    'preference:a':{choice:'flag',confidence:.2,probabilities:{pass:.48,flag:.52,unknown:0}},
    pace:{choice:'pass',confidence:.9,probabilities:{pass:.9,flag:.1,unknown:0}},
  }}));
  const candidate = {id:'place-a',name:'History Museum',address:'',latitude:0,longitude:0,types:['museum'],source:'demo' as const};
  const review = await new JevProvider(false).review(request, [candidate], [{id:'a',placeId:'place-a',durationMinutes:60,reason:'history'}], 1, 'local', new AbortController().signal);
  expect(review.status).toBe('unknown');
  expect(review.issues).toMatchObject([{checkId:'preference',status:'unknown',subjectIds:['a']}]);
  vi.unstubAllEnvs();
});
it('builds independent minimal-state questions for a typed Jev query', async () => {
  vi.stubEnv('TYPESAFE_API_KEY', 'test-key');
  const candidates = [
    {id:'place-a',name:'Art Hall',address:'',latitude:0,longitude:0,types:['museum'],source:'demo' as const},
    {id:'place-b',name:'Food Market',address:'',latitude:0,longitude:0,types:['market'],source:'demo' as const},
  ];
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({model:'jev-test',answers:{
    'place-a':{choice:'pass',confidence:.8,probabilities:{pass:.8,flag:.1,unknown:.1}},
    'place-b':{choice:'unknown',confidence:.4,probabilities:{pass:.3,flag:.2,unknown:.5}},
  }}));
  const decisions = await new JevProvider(false).query(request, candidates, [], {dimension:'preference_fit',subjectIds:['place-a','place-b'],scope:'candidate'}, 3, new AbortController().signal);
  const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(Object.keys(body.questions)).toEqual(['place-a','place-b']);
  expect(body.state).toEqual({userPreference:request.preference,scope:'candidate',subjects:[
    {id:'place-a',place:{id:'place-a',name:'Art Hall',types:['museum']}},
    {id:'place-b',place:{id:'place-b',name:'Food Market',types:['market']}},
  ]});
  expect(decisions).toMatchObject([{version:3,subjectId:'place-a',model:'jev-test'},{version:3,subjectId:'place-b',model:'jev-test'}]);
  vi.unstubAllEnvs();
});
it('rejects invalid Jev query scope before calling the service', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  const candidates = [
    {id:'place-a',name:'A',address:'',latitude:0,longitude:0,types:['museum'],source:'demo' as const},
    {id:'place-b',name:'B',address:'',latitude:0,longitude:0,types:['park'],source:'demo' as const},
  ];
  await expect(new JevProvider(false).query(request, candidates, [], {dimension:'experience_similarity',subjectIds:['place-a','place-b'],scope:'candidate'}, 1, new AbortController().signal)).rejects.toThrow('行程段');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('caps repeated repairs per stage', async () => {
  vi.spyOn(JevProvider.prototype, 'review').mockImplementation(async (_r, _p, a, version, scope) => ({ version, scope, status:'flag', model:'test',latencyMs:0,issues:[{checkId:'repetition',status:'flag',subjectIds:a.map(x=>x.id),message:'test conflict'}] }));
  const original = PlannerProvider.prototype.propose;
  vi.spyOn(PlannerProvider.prototype, 'propose').mockImplementation(function (this: PlannerProvider, ...args) {
    if (args[3].length) return Promise.resolve({activities:args[2].map(a=>({...a,durationMinutes:a.durationMinutes+1})),done:false});
    return original.apply(this,args);
  });
  const result = await planTrip(request);
  expect(result.events.filter(e=>e.type==='repair_diff')).toHaveLength(2);
  expect(result.snapshot.issues.some(i=>i.status==='flag')).toBe(true);
  expect(result.events.some(e=>e.type==='stopped')).toBe(true);
});
it('assigns a fresh ID after repair removes an earlier activity', async () => {
  vi.stubEnv('LLM_API_KEY', 'test-key'); vi.stubEnv('LLM_MODEL', 'test-model');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ model:'test-model',choices:[{message:{content:JSON.stringify({activity:{placeId:'new-place',durationMinutes:60,reason:'new'},done:false})}}] }));
  const current = [{id:'activity-1',placeId:'first',durationMinutes:60,reason:'first'},{id:'activity-3',placeId:'third',durationMinutes:60,reason:'third'}];
  const proposal = await new PlannerProvider(false).propose(request, [], current, [], new AbortController().signal);
  expect(proposal.activities.at(-1)?.id).toBe('activity-4');
  vi.unstubAllEnvs();
});
