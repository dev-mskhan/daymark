import { ApiError } from '@/lib/api/errors';
import { authed, notFound, parseBody, tripIdParam } from '@/lib/api/handler';
import { deleteTrip, getTripDetail, updateTrip } from '@/lib/trips/repository';
import { updateTripSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';

// Task 6.35
export const GET = authed(async ({ user, db, params }) => {
  const detail = await getTripDetail(db, user.id, tripIdParam(params));
  if (!detail) throw notFound();
  return Response.json({ trip: detail });
});

// Task 6.36
export const PATCH = authed(async ({ request, user, db, params }) => {
  const patch = await parseBody(request, updateTripSchema);
  const result = await updateTrip(db, user.id, tripIdParam(params), patch);
  if (result.kind === 'not_found') throw notFound();
  if (result.kind === 'archived') throw new ApiError('conflict', 'Archived trips cannot be edited. Duplicate the trip to continue.');
  return Response.json({ trip: result.detail });
});

// Task 6.41 — destructive, so the caller must confirm explicitly.
export const DELETE = authed(async ({ request, user, db, params }) => {
  if (new URL(request.url).searchParams.get('confirm') !== 'true')
    throw new ApiError('invalid_request', 'Deleting a trip is permanent. Repeat the request with ?confirm=true to confirm.');
  if (!(await deleteTrip(db, user.id, tripIdParam(params)))) throw notFound();
  return new Response(null, { status: 204 });
});
