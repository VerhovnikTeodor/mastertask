export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>;

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export function toQueryString(params: Query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}${toQueryString(query)}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'MasterTask',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Strežnik ni dosegljiv. Preverite internetno povezavo.');
  }

  if (response.status === 204) return undefined as T;

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Odziv brez JSON telesa (npr. napaka posrednika).
  }

  if (!response.ok) {
    const payload = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    if (response.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
    throw new ApiError(
      response.status,
      payload.error ?? `Zahteva ni uspela (${response.status}).`,
      payload.fields,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T = void>(path: string, query?: Query) => request<T>('DELETE', path, undefined, query),
};

export function errorMessage(error: unknown, fallback = 'Prišlo je do napake.') {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
