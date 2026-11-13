import { describe, expect, it, vi, afterEach } from 'vitest';
import { summarizeTiming, retainDiverseCandidates, nearbyCandidates } from './planning-context';
import { planTrip } from './planner';
import { PlannerProvider } from './providers/planner';
import { JevProvider } from './providers/jev';
import type { Activity, Place, TripRequest } from './domain';
const request: TripRequest = {destination:'Beijing',startAt:'2026-10-12T09:00:00',endAt:'2026-10-12T19:00:00',preference:'Art and food, keep it relaxed',mode:'fixture'};
const activities: Activity[] = [{id:'a',placeId:'a',durationMinutes:90,reason:'art'},{id:'b',placeId:'b',durationMinutes:60,reason:'food'}];
const place = (id:string, types:string[], label='alternative', offset=0):Place => ({id,name:id,address:'',latitude:39.9+offset,longitude:116.4,types,source:'demo',screeningLabel:label});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('controller feedback',()=>{
  it('includes 129-minute walking leg in elapsed and remaining time',()=>{
    expect(summarizeTiming(request,activities,[129])).toMatchObject({activityMinutes:150,knownTravelMinutes:129,usedMinutes:279,remainingMinutes:321});
  });
  it('does not present unknown routes as exact zero-minute travel',()=>{
    expect(summarizeTiming(request,activities,[null])).toMatchObject({usedMinutes:null,remainingMinutes:null,minimumUsedMinutes:150,remainingUpperBoundMinutes:450});
  });
  it('retains rest and local alternatives alongside many priority museums',()=>{
    const pool=retainDiverseCandidates([...Array.from({length:5},(_,i)=>place(`museum-${i}`,['museum'],'priority')),place('park',['park']),place('bookshop',['books'])]);
    expect(pool.map(p=>p.id)).toContain('park');expect(pool.map(p=>p.id)).toContain('bookshop');
    expect(pool.find(p=>p.id==='park')?.screeningLabel).toBe('alternative');
  });
  it('bounds next-route queries and excludes already visited places',()=>{
    const origin=place('origin',['museum']);
    const pool=nearbyCandidates([origin,...Array.from({length:20},(_,i)=>place(String(i),[i%2?'park':'restaurant'],'priority',i*.001))],origin,new Set(['origin']));
    expect(pool.length).toBeLessThanOrEqual(6);expect(pool.some(p=>p.id==='origin')).toBe(false);expect(pool[0].id).toBe('0');
  });
  it('passes timing of the same committed version to planner and reviewer',async()=>{
    const planner=vi.spyOn(PlannerProvider.prototype,'propose');
    const reviewer=vi.spyOn(JevProvider.prototype,'review');
    await planTrip(request);
    const call=planner.mock.calls.find(args=>args[2].length===2)!;
    expect(call[6]?.timing).toMatchObject({activityMinutes:120,knownTravelMinutes:18,usedMinutes:138,remainingMinutes:462});
    const review=reviewer.mock.calls.find(args=>args[2].length===2)!;
    expect(review[8]?.remainingMinutes).toBe(462);
    expect(call[6]?.version).toBe(review[3]);
  });
  it('binds concrete conditions and evidence to semantic feedback',async()=>{
    const result=await planTrip(request);
    const flagged=result.events.find(e=>e.review?.status==='flag')!.review!.issues[0];
    expect(flagged.condition).toBeTruthy();expect(flagged.repairHint).toBeTruthy();
    expect(flagged.evidence?.join(' ')).toContain(request.preference);
    expect(flagged.evidence?.join(' ')).toContain('程序时间计算');
  });
  it('runs final global review when LLM finishes without adding a node',async()=>{
    const original=PlannerProvider.prototype.propose;
    vi.spyOn(PlannerProvider.prototype,'propose').mockImplementation(function(this:PlannerProvider,...args){
      if(args[2].length===3)return Promise.resolve({activities:args[2],done:true});
      return original.apply(this,args);
    });
    const result=await planTrip(request);
    expect(result.events.some(e=>e.review?.scope==='global')).toBe(true);
    expect(result.snapshot.issues.some(i=>i.checkId==='incomplete')).toBe(false);
  });
});
