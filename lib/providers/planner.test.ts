import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRepair, PlannerProvider } from './planner';
const current = [
  { id: 'activity-1', placeId: 'today-art', durationMinutes: 90, reason: 'art' },
  { id: 'activity-3', placeId: 'library', durationMinutes: 60, reason: 'museum' },
];
const replacement = { index: 1, placeId: 'market', durationMinutes: 45, reason: 'variety' };
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('repair patches', () => {
  it('evaluates a structured next-step answer against the available candidates', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test');
    vi.stubEnv('GROQ_MODEL', 'test-model');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      model: 'test-model',
      choices: [{
        message: {
          content: JSON.stringify({
            action: 'proposal',
            activity: { placeId: 'riverside-park', durationMinutes: 60, reason: 'A quiet nature walk fits the request.' },
            done: false,
          }),
        },
      }],
    }));
    const candidate = {
      id: 'riverside-park',
      name: 'Riverside Park',
      address: '',
      latitude: 40.75,
      longitude: -73.99,
      types: ['park', 'nature'],
      source: 'demo' as const,
    };
    const result = await new PlannerProvider(false).nextAction(
      { destination: 'New York City', startAt: '2026-10-12T09:00:00', endAt: '2026-10-12T19:00:00', preference: 'A quiet nature walk' },
      [candidate],
      [],
      new AbortController().signal,
      undefined,
      undefined,
      [],
      false,
    );
    expect(result).toMatchObject({
      action: 'proposal',
      proposal: {
        activities: [{ id: 'activity-1', placeId: 'riverside-park', durationMinutes: 60 }],
        done: false,
        model: 'test-model',
      },
    });
  });

  it('preserves server-owned IDs even if a model supplies a replacement ID', () => {
    const result = applyRepair(current, { updates: [{ ...replacement, id: 'new-id' }], removeIndices: [], done: false });
    expect(result.activities.map(a => a.id)).toEqual(['activity-1', 'activity-3']);
    expect(result.activities[1].placeId).toBe('market');
    expect(current[1].placeId).toBe('library');
  });
  it('uses original version indices when deleting and replacing together', () => {
    const result = applyRepair(current, { updates: [replacement], removeIndices: [0], done: true });
    expect(result.activities).toEqual([{ ...current[1], placeId: 'market', durationMinutes: 45, reason: 'variety' }]);
  });
  it.each([
    {updates:[{...replacement,index:2}],removeIndices:[],done:false},
    {updates:[replacement],removeIndices:[1],done:false},
    {updates:[replacement,replacement],removeIndices:[],done:false},
    {updates:[],removeIndices:[0,1],done:true},
  ])('rejects invalid targets without changing the current version', patch => {
    expect(() => applyRepair(current, patch)).toThrow();
    expect(current.map(a=>a.placeId)).toEqual(['today-art','library']);
  });
  it('converts a real-interface repair response to a stable-ID proposal', async () => {
    vi.stubEnv('GROQ_API_KEY','test'); vi.stubEnv('GROQ_MODEL','test');
    vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({model:'test',choices:[{message:{content:JSON.stringify({updates:[replacement],removeIndices:[],done:false})}}]}));
    const result = await new PlannerProvider(false).propose({destination:'Beijing',startAt:'2026-10-12T09:00:00',endAt:'2026-10-12T19:00:00',preference:'Art and variety'}, [], current, [{checkId:'repetition',subjectIds:['activity-3'],status:'flag',message:'replace duplicate museum'}],new AbortController().signal);
    expect(result.activities[1].id).toBe('activity-3');
    expect(result.activities[1].placeId).toBe('market');
  });
});
it('treats missing repair completion flag as unfinished rather than losing the draft', () => {
  const result = applyRepair(current, { updates: [replacement], removeIndices: [] });
  expect(result.done).toBe(false);
  expect(result.activities[1].id).toBe('activity-3');
});
it('rejects a second Jev query after the controller supplies decisions', async () => {
  vi.stubEnv('GROQ_API_KEY','test'); vi.stubEnv('GROQ_MODEL','test');
  vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({model:'test',choices:[{message:{content:JSON.stringify({action:'ask_jev',query:{dimension:'preference_fit',subjectIds:['a','b'],scope:'candidate'}})}}]}));
  await expect(new PlannerProvider(false).nextAction({destination:'Beijing',startAt:'2026-10-12T09:00:00',endAt:'2026-10-12T19:00:00',preference:'Art and variety'}, [], current, new AbortController().signal, undefined, undefined, [{queryId:'q',version:1,dimension:'preference_fit',subjectId:'a',choice:'pass',confidence:.9,probabilities:{pass:.9,flag:.1,unknown:0},model:'test'}], false)).rejects.toThrow('must submit');
});
