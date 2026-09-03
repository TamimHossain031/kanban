'use client';

import { useSyncExternalStore } from 'react';
import { authStore } from './auth-store';

/** Reactive view of the in-memory auth session. */
export function useAuth() {
  const user = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getUser(),
    () => null,
  );
  const accessToken = useSyncExternalStore(
    authStore.subscribe,
    () => authStore.getAccessToken(),
    () => null,
  );

  return {
    user,
    isAuthenticated: Boolean(accessToken),
    logout: () => authStore.clear(),
  };
}
