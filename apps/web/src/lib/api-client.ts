'use client';

import { authStore } from './auth-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Coalesce concurrent refreshes into one in-flight request.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = authStore.getRefreshToken();
  if (!refreshToken) return false;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          authStore.clear();
          return false;
        }
        const data = await res.json();
        authStore.setSession(data.user, data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Proactively exchange the stored refresh token for a fresh session.
 * Call this on first load *before* any authenticated request so we never
 * fire a doomed 401 just to trigger a refresh. Resolves to whether a
 * session was restored.
 */
export function refreshSession(): Promise<boolean> {
  return tryRefresh();
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** internal: prevents infinite refresh loops */
  _retry?: boolean;
}

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (Array.isArray(data?.message)) return data.message.join(', ');
    return data?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, _retry } = options;
  const token = authStore.getAccessToken();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Silent refresh on a single 401, then retry the original request once.
  if (res.status === 401 && !_retry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiRequest<T>(path, { ...options, _retry: true });
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, await extractError(res));
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Auth calls that don't attach a token / shouldn't trigger refresh. */
export async function apiPublic<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiError(res.status, await extractError(res));
  return res.json() as Promise<T>;
}

export { API_URL };
