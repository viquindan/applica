import { getToken } from './auth';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  // POST /api/applications/[id]/action's 409 for 'approve' carries the
  // specific unresolved-required-fields list (see docs/APPLY-ENGINE.md §1/§9)
  // so callers can tell "genuinely missing data" apart from other 409s
  // (already approved, quota, etc.) and escalate to the assisted/real-browser
  // flow instead of just failing.
  blockers?: string[];
  constructor(status: number, message: string, blockers?: string[]) {
    super(message);
    this.status = status;
    this.blockers = blockers;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body?.error ?? res.statusText, body?.blockers);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
