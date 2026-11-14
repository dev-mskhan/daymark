import { ApiError } from '@/lib/api/errors';
import { authed, notFound, parseBody, tripIdParam } from '@/lib/api/handler';
import { acceptRevision } from '@/lib/trips/repository';
import { acceptSchema } from '@/lib/trips/schemas';

export const runtime = 'nodejs';

// Task 6.38
export const POST = authed(async ({ request, user, db, params }) => {
  const { planningRunId } = await parseBody(request, acceptSchema);
  const result = await acceptRevision(db, user.id, tripIdParam(params), planningRunId);
  if (result.kind === 'not_found') throw notFound();
  if (result.kind === 'run_not_found') throw new ApiError('not_found', 'Planning run not found for this trip.');
  if (result.kind === 'run_not_acceptable') throw new ApiError('conflict', 'That planning run did not produce an itinerary that can be saved.');
  return Response.json({ revisionId: result.revisionId, revisionNumber: result.revisionNumber }, { status: 201 });
});
