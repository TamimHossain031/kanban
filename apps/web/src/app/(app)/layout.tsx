'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/use-auth';
import { useSessionHydration } from '@/lib/providers';

export default function AppLayout({ children }: { children: ReactNode }) {
  const hydrated = useSessionHydration();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();

  // Auth gate: once hydration settles, bounce anonymous users to login.
  useEffect(() => {
    if (hydrated && !isAuthenticated) router.replace('/login');
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) {
    return (
      <div className="graph-paper grid min-h-screen place-items-center text-ink-muted">
        Restoring your session…
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-rule bg-surface px-4">
        <Link href="/boards" className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-accent text-sm font-semibold text-white">
            K
          </span>
          <span className="text-sm font-semibold text-ink">Mini Kanban</span>
        </Link>
        <div className="flex items-center gap-3">
          {user && <Avatar name={user.name} size={28} />}
          <span className="hidden text-[13px] text-ink-muted sm:inline">{user?.email}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              logout();
              router.replace('/login');
            }}
          >
            Sign out
          </Button>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
