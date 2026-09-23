const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The session is gone or was never there — the shell should sign out. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      // Cross-origin in production, so the session cookie only rides along
      // if this is set on every single request.
      credentials: 'include',
      headers: {
        // A FormData body (a resume upload) must not get this header —
        // the browser sets its own multipart boundary, and overriding it
        // breaks the upload.
        ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    // fetch only rejects on a genuine network fault — worth distinguishing
    // from a server error, because the useful advice is different.
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? 'Something went wrong. Try again.',
      error?.details,
    );
  }

  return body as T;
}
