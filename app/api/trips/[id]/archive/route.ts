import { authed, notFound, tripIdParam } from '@/lib/api/handler';
import { archiveTrip } from '@/lib/trips/repository';

export const runtime = 'nodejs';

// Task 6.40
export const POST = authed(async ({ user, db, params }) => {
  const archived = await archiveTrip(db, user.id, tripIdParam(params));
  if (!archived) throw notFound();
  return Response.json({ trip: archived });
});
