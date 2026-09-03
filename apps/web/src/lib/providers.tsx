'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { refreshSession } from './api-client';
import { authStore } from './auth-store';

/**
 * On first load we have no access token in memory (it lived only in the last
 * tab). If a refresh token is in localStorage, silently exchange it so the
 * user stays logged in across reloads. Until that resolves, `hydrated` is
 * false so auth-gated screens can show a skeleton instead of bouncing to login.
 */
export function useSessionHydration() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const refresh = authStore.getRefreshToken();
    if (!refresh || authStore.getAccessToken()) {
      setHydrated(true);
      return;
    }
    // Exchange the refresh token up front. The /auth/refresh response already
    // carries the user, so no authenticated call (and no doomed 401) is needed.
    refreshSession()
      .then((ok) => {
        if (!ok) authStore.clear();
      })
      .finally(() => setHydrated(true));
  }, []);

  return hydrated;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--rule)',
          },
        }}
      />
    </QueryClientProvider>
  );
}
