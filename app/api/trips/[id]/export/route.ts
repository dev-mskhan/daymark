import { authed, notFound, tripIdParam } from '@/lib/api/handler';
import { buildTripExport, renderMarkdown } from '@/lib/trips/export';
import { getTripDetail } from '@/lib/trips/repository';

export const runtime = 'nodejs';

// Task 6.42 — `?format=markdown` for a printable document, JSON by default.
export const GET = authed(async ({ request, user, db, params }) => {
  const detail = await getTripDetail(db, user.id, tripIdParam(params));
  if (!detail) throw notFound();
  const data = buildTripExport(detail);
  if (new URL(request.url).searchParams.get('format') === 'markdown')
    return new Response(renderMarkdown(data), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="daymark-trip.md"' } });
  return Response.json({ export: data });
});
