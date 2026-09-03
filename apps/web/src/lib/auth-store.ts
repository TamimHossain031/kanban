'use client';

import { AuthUser } from '@/features/boards/types';

/**
 * Token storage strategy (documented trade-off — see README):
 * The access token lives in memory; the refresh token lives in localStorage so
 * a page reload can silently re-hydrate a session via POST /auth/refresh.
 *
 * In-memory Bearer avoids CSRF entirely (nothing is auto-sent by the browser)
 * and an XSS attacker can't read the access token from a JS variable across a
 * reload. The refresh token in localStorage is the pragmatic concession that
 * keeps you logged in; the production shape (httpOnly cookie + rotation) is
 * named in the README.
 */

const REFRESH_KEY = 'kanban.refreshToken';

let accessToken: string | null = null;
let currentUser: AuthUser | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export const authStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getAccessToken() {
    return accessToken;
  },

  getUser() {
    return currentUser;
  },

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },

  setSession(user: AuthUser, access: string, refresh: string) {
    accessToken = access;
    currentUser = user;
    try {
      window.localStorage.setItem(REFRESH_KEY, refresh);
    } catch {
      /* storage may be unavailable (private mode) — session still works this tab */
    }
    emit();
  },

  /** Update just the access token after a silent refresh. */
  setAccessToken(access: string, user?: AuthUser) {
    accessToken = access;
    if (user) currentUser = user;
    emit();
  },

  clear() {
    accessToken = null;
    currentUser = null;
    try {
      window.localStorage.removeItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
    emit();
  },
};
