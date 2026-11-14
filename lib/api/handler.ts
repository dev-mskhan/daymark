import type { ZodType } from 'zod';
import { requireUser, type SessionUser } from '@/lib/auth/server';
import { DatabaseConfigError, getDb, type AppDb } from '@/lib/db';
import { ApiError, errorResponse } from './errors';
import { idSchema } from '@/lib/trips/schemas';

interface Context {
  request: Request;
  user: SessionUser;
  db: AppDb;
  params: Record<string, string>;
}

/**
 * Wraps a route handler: requires a signed-in user, opens the database, and turns every failure
 * into a consistent JSON error. Handlers receive the session user — the only trusted identity.
 */
export function authed(handler: (context: Context) => Promise<Response>) {
  return async (request: Request, routeContext: { params: Promise<unknown> }): Promise<Response> => {
    try {
      const user = await requireUser();
      const db = (() => {
        try { return getDb(); }
        catch (error) {
          if (error instanceof DatabaseConfigError) throw new ApiError('unavailable', 'Saved trips are not available right now.');
          throw error;
        }
      })();
      const params = ((await routeContext.params) ?? {}) as Record<string, string>;
      return await handler({ request, user, db, params });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const body = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new ApiError('invalid_request', `${where}${issue?.message ?? 'Invalid request.'}`);
  }
  return parsed.data;
}

/** Malformed ids are reported as not found so callers cannot distinguish them from foreign trips. */
export function tripIdParam(params: Record<string, string>): string {
  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) throw new ApiError('not_found', 'Trip not found.');
  return parsed.data;
}

export const notFound = () => new ApiError('not_found', 'Trip not found.');
