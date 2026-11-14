import { ApiError } from '@/lib/api/errors';
import { authed, notFound, tripIdParam } from '@/lib/api/handler';
import type { DayBoundary, MultiDayRequest, Place, RunEvent } from '@/lib/domain';
import { planMultiDayTrip } from '@/lib/planner-multiday';
import { getTripDetail, savePlanningRun } from '@/lib/trips/repository';

export const runtime = 'nodejs';

// Task 6.37 — streams planning events for every day (NDJSON), then persists the run.
export const POST = authed(async ({ request, user, db, params }) => {
  const tripId = tripIdParam(params);
  const detail = await getTripDetail(db, user.id, tripId);
  if (!detail) throw notFound();
  if (detail.trip.status === 'archived') throw new ApiError('conflict', 'Archived trips cannot be planned.');
  if (!detail.days.length) throw new ApiError('invalid_request', 'Add at least one day before planning.');

  const days: DayBoundary[] = detail.days.map(day => ({
    dayNumber: day.dayNumber,
    date: day.date,
    startTime: day.startTime.slice(0, 5),
    endTime: day.endTime.slice(0, 5),
    ...(day.overnightPlaceData ? { overnightPlace: day.overnightPlaceData as Place } : {}),
  }));
  const multiDay: MultiDayRequest = {
    destination: detail.trip.destination,
    origin: detail.trip.origin ?? undefined,
    partySize: detail.trip.partySize,
    preference: detail.trip.preference,
    constraints: detail.trip.constraints,
    mode: detail.trip.mode,
    days,
  };

  const abort = new AbortController();
  request.signal.addEventListener('abort', () => abort.abort(), { once: true });
  const events: (RunEvent & { day?: number })[] = [];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
      try {
        const result = await planMultiDayTrip(multiDay, (event, day) => {
          const tagged = { ...event, day };
          events.push(tagged);
          send(tagged);
        }, abort.signal);
        const runId = await savePlanningRun(db, user.id, tripId, {
          mode: detail.trip.mode,
          status: result.status === 'complete' ? 'complete' : 'needs_attention',
          events,
          result: { status: result.status, days: result.days },
        });
        send({ type: 'saved', actor: 'Controller', message: 'Planning run saved.', runId, status: result.status });
      } catch (error) {
        if (abort.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Planning failed';
        await savePlanningRun(db, user.id, tripId, { mode: detail.trip.mode, status: 'failed', events, errorMessage: message }).catch(() => null);
        send({ type: 'error', actor: 'Controller', message });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } });
});
