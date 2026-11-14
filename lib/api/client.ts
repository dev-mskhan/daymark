export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * fetch for authenticated API calls. A 401 means the session expired or is missing, so the user
 * is sent to sign in and returned here afterwards; a 403 gets a clear message (Tasks 6.23, 6.24).
 */
export async function apiFetch(input: string, init?: RequestInit) {
  const response = await fetch(input, init);
  if (response.ok) return response;
  if (response.status === 401) {
    const next = encodeURIComponent(location.pathname);
    location.assign(`/sign-in?reason=expired&next=${next}`);
    throw new ApiRequestError(
      "Your session expired. Please sign in again.",
      401,
      "unauthenticated",
    );
  }
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };
  throw new ApiRequestError(
    response.status === 403
      ? "You don't have access to that."
      : (body.error ?? "Something went wrong. Please try again."),
    response.status,
    body.code,
  );
}
