import { z } from 'zod';
import { planMultiDayTrip } from '@/lib/planner-multiday';
import { toPlanningError, sanitizeForClient } from '@/lib/errors';

export const runtime = 'nodejs';

const dayBoundarySchema = z.object({
  dayNumber: z.number().int().min(1).max(7),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be HH:MM'),
  overnightPlace: z.any().optional(),
});

const schema = z.object({
  destination: z.string().trim().min(2, 'Destination is required').max(100, 'Destination is too long'),
  origin: z.string().trim().min(2).max(160).optional(),
  days: z
    .array(dayBoundarySchema)
    .min(1, 'At least one day is required')
    .max(7, 'Maximum 7 days allowed'),
  partySize: z.number().int().min(1).max(20).default(1),
  preference: z.string().trim().min(2, 'Please describe your interests').max(2000, 'Preferences are too long'),
  constraints: z.string().trim().max(2000).default(''),
  mode: z.enum(['fixture', 'live']).default('fixture'),
}).refine(
  (v) => v.days.every((d) => {
    const [sh, sm] = d.startTime.split(':').map(Number);
    const [eh, em] = d.endTime.split(':').map(Number);
    return eh * 60 + em > sh * 60 + sm;
  }),
  'Each day\'s end time must be after its start time.',
);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return Response.json({
      error: firstError?.message || 'Please check your trip details and try again.',
      code: 'validation_failed',
      recovery: [
        { type: 'retry', label: 'Fix and try again', description: 'Check the form fields' },
      ],
    }, { status: 400 });
  }

  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        await planMultiDayTrip(
          parsed.data,
          (event, dayNumber) => {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ ...event, dayNumber }) + '\n',
              ),
            );
          },
          abort.signal,
        );
      } catch (error) {
        if (!abort.signal.aborted) {
          const planningError = toPlanningError(error);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: 'error',
                code: planningError.code,
                message: planningError.userMessage,
                recovery: planningError.recovery,
                ...(process.env.NODE_ENV === 'development' && planningError.technicalDetails && {
                  technical: sanitizeForClient(planningError.technicalDetails),
                }),
              }) + '\n',
            ),
          );
        }
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
