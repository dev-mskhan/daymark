import { z } from 'zod';
import { planTrip } from '@/lib/planner';
import { toPlanningError, sanitizeForClient } from '@/lib/errors';

export const runtime = 'nodejs';

const schema = z.object({
  destination: z.string().trim().min(2, 'Destination is required').max(100, 'Destination is too long'),
  origin: z.string().trim().min(2).max(160).optional(),
  startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Invalid start time format'),
  endAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, 'Invalid end time format'),
  partySize: z.number().int().min(1).max(20).default(1),
  preference: z.string().trim().min(2, 'Please describe your interests').max(2000, 'Preferences are too long'),
  constraints: z.string().trim().max(2000).default(''),
  mode: z.enum(['fixture', 'live']).default('fixture')
}).refine(
  v => [v.startAt, v.endAt].every(t => Number.isFinite(Date.parse(t + 'Z')) && new Date(t + 'Z').toISOString().slice(0, 19) === t) 
    && v.startAt.slice(0, 10) === v.endAt.slice(0, 10) 
    && Date.parse(v.endAt + 'Z') > Date.parse(v.startAt + 'Z'),
  'Please provide a valid time window within a single day (end time must be after start time).'
);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  
  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return Response.json({ 
      error: firstError?.message || 'Please check your trip details and try again.',
      code: 'validation_failed',
      recovery: [
        { type: 'retry', label: 'Fix and try again', description: 'Check the form fields' }
      ]
    }, { status: 400 });
  }
  
  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });
  
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        await planTrip(
          parsed.data,
          event => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')),
          abort.signal
        );
      } catch (error) {
        if (!abort.signal.aborted) {
          const planningError = toPlanningError(error);
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'error',
            code: planningError.code,
            message: planningError.userMessage,
            recovery: planningError.recovery,
            ...(process.env.NODE_ENV === 'development' && planningError.technicalDetails && { technical: sanitizeForClient(planningError.technicalDetails) })
          }) + '\n'));
        }
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() { abort.abort(); },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
}
