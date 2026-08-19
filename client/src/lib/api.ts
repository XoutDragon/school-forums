import type { ApiError } from '@campusconnect/shared';

/** Thrown for every non-2xx response so callers can branch on `code` rather than parsing
 *  message strings. `message` is already written for a person to read — the server owns
 *  the wording (§8). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type Body = Record<string, unknown> | unknown[] | undefined;

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    // The session is an httpOnly cookie — without this every request is anonymous.
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const err = (parsed as ApiError | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? 'UNKNOWN',
      err?.message ?? 'Something went wrong.',
      err?.details,
    );
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body),
  put: <T>(path: string, body?: Body) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: Body) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),

  async upload(files: File[]) {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    const res = await fetch('/api/uploads', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as ApiError | null;
      throw new ApiRequestError(
        res.status,
        err?.error.code ?? 'UPLOAD_FAILED',
        err?.error.message ?? "That file didn't upload.",
      );
    }
    return (await res.json()) as { url: string; name: string; mimeType: string; size: number }[];
  },
};

export const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
};
