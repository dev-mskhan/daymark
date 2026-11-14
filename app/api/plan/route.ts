import { z } from 'zod';
import { planTrip } from '@/lib/planner';
export const runtime = 'nodejs';
const schema = z.object({ destination: z.string().trim().min(2).max(100), origin: z.string().trim().min(2).max(160).optional(), startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/), endAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/), partySize: z.number().int().min(1).max(20).default(1), preference: z.string().trim().min(2).max(2000), constraints: z.string().trim().max(2000).default(''), mode: z.enum(['fixture', 'live']).default('fixture') }).refine(v => [v.startAt, v.endAt].every(t => Number.isFinite(Date.parse(t + 'Z')) && new Date(t + 'Z').toISOString().slice(0, 19) === t) && v.startAt.slice(0, 10) === v.endAt.slice(0, 10) && Date.parse(v.endAt + 'Z') > Date.parse(v.startAt + 'Z'), 'The trip needs a valid time window within a single day.');
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Please check the destination, preferences, and single-day time window.' }, { status: 400 });
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try { await planTrip(parsed.data, event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')), abort.signal); }
      catch (error) { if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Planning failed' }) + '\n')); }
      finally { if (!abort.signal.aborted) controller.close(); }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
}
