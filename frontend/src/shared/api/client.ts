import { refreshSession, session } from './session';

export class ApiError extends Error {
  readonly status: number;
  readonly details: string[];
  readonly correlationId?: string;

  constructor(status: number, message: string, details: string[] = [], correlationId?: string) {
    super(message);
    this.status = status;
    this.details = details;
    this.correlationId = correlationId;
  }
}

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return `/api${path}${search ? `?${search}` : ''}`;
}

async function toError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
    correlationId?: string;
  };
  const details = Array.isArray(body.message) ? body.message : [];
  const message =
    (Array.isArray(body.message) ? body.message[0] : body.message) ??
    (response.status >= 500 ? 'Something went wrong, try again' : response.statusText);
  return new ApiError(response.status, message, details, body.correlationId);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const token = session.token;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'include',
    signal: options.signal,
  });
}

export async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  let response = await send(path, options);
  if (response.status === 401 && session.token && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      response = await send(path, options);
    }
  }
  if (!response.ok) {
    throw await toError(response);
  }
  return response;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await request(path, options);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const newIdempotencyKey = () => crypto.randomUUID();
