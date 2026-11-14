import { authed, parseBody } from '@/lib/api/handler';
import { createTrip, listTrips } from '@/lib/trips/repository';
import { createTripSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';

// Task 6.34
export const GET = authed(async ({ request, user, db }) => {
  const includeArchived = new URL(request.url).searchParams.get('archived') === 'true';
  return Response.json({ trips: await listTrips(db, user.id, { includeArchived }) });
});

// Task 6.33
export const POST = authed(async ({ request, user, db }) => {
  const input = await parseBody(request, createTripSchema);
  return Response.json({ trip: await createTrip(db, user.id, input) }, { status: 201 });
});
