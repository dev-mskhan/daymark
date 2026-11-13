import { describe, expect, it } from 'vitest';
import { POST } from './route';
const base = {destination:'Tokyo',startAt:'2026-10-12T09:00:00',endAt:'2026-10-12T19:00:00',preference:'Art and food, avoid repetitive museums.',mode:'fixture'};
describe('planning stream', () => {
  it('streams a complete fixture repair with ordered events', async () => {
    const response = await POST(new Request('http://localhost/api/plan',{method:'POST',body:JSON.stringify(base)}));
    expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    const events = (await response.text()).trim().split('\n').map(line=>JSON.parse(line));
    expect(events.at(-1).type).toBe('complete');
    expect(events.some(e=>e.type==='repair_diff')).toBe(true);
  });
  it('accepts concise Chinese preferences', async () => {
    const response = await POST(new Request('http://localhost/api/plan',{method:'POST',body:JSON.stringify({...base,preference:'喜欢艺术'})}));
    expect(response.status).toBe(200);
    const events = (await response.text()).trim().split('\n').map(line=>JSON.parse(line));
    expect(events.at(-1).type).toBe('complete');
  });
  it.each([
    {startAt:'2026-02-30T09:00:00',endAt:'2026-02-30T19:00:00'},
    {endAt:'2026-10-13T19:00:00'},
    {endAt:'2026-10-12T08:00:00'},
  ])('rejects invalid or cross-day dates before running providers', async invalid => {
    const response = await POST(new Request('http://localhost/api/plan',{method:'POST',body:JSON.stringify({...base,...invalid})}));
    expect(response.status).toBe(400);
  });
});
