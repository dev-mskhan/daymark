import { z } from 'zod';
import { JevProvider } from '@/lib/providers/jev';
import { blockedRequestChecks, requestScopeMessage } from '@/lib/request-screening';

export const runtime = 'nodejs';
const schema = z.object({ destination: z.string().trim().min(2).max(100), preference: z.string().trim().min(2).max(2000) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Check the destination and day preferences.' }, { status: 400 });
  try {
    const screening = await new JevProvider(false).screenRequest({ ...parsed.data, startAt: '', endAt: '', mode: 'live' }, request.signal);
    const blocked = blockedRequestChecks(screening);
    return Response.json({ allowed: blocked.length === 0, blocked, message: requestScopeMessage(blocked), screening });
  } catch (error) {
    if (request.signal.aborted) return Response.json({ error: 'Request cancelled.' }, { status: 499 });
    return Response.json({ allowed: true, blocked: [], message: '', screening: null, warning: 'Scope check unavailable; planning will continue.' });
  }
}
