export type ApiErrorCode = 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid_request' | 'conflict' | 'unavailable' | 'internal';

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  conflict: 409,
  unavailable: 503,
  internal: 500,
};

/** An error whose message is safe to show to the user. */
export class ApiError extends Error {
  readonly status: number;
  constructor(readonly code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = STATUS[code];
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
  console.error('Unhandled API error', error);
  return Response.json({ error: 'Something went wrong. Please try again.', code: 'internal' }, { status: 500 });
}
