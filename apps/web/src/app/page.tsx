'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { authStore } from '@/lib/auth-store';

/** Route to the board list or login depending on whether we can restore a session. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const hasSession = authStore.getAccessToken() || authStore.getRefreshToken();
    router.replace(hasSession ? '/boards' : '/login');
  }, [router]);

  return null;
}
