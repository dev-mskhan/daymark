import { authed, notFound, tripIdParam } from '@/lib/api/handler';
import { duplicateTrip } from '@/lib/trips/repository';

export const runtime = 'nodejs';

// Tasks 6.39, 4.22
export const POST = authed(async ({ user, db, params }) => {
  const copy = await duplicateTrip(db, user.id, tripIdParam(params));
  if (!copy) throw notFound();
  return Response.json({ trip: copy }, { status: 201 });
});
