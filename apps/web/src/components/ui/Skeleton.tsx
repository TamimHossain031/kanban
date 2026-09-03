'use client';

import { cn } from '@/lib/cn';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('animate-pulse rounded bg-rule/60', className)}
      aria-hidden="true"
    />
  );
}

/** A skeleton board — lanes with placeholder cards, not a spinner. */
export function BoardSkeleton() {
  return (
    <div className="flex gap-4 p-6">
      {[0, 1, 2].map((lane) => (
        <div key={lane} className="w-72 shrink-0">
          <Skeleton className="mb-3 h-5 w-32" />
          <div className="space-y-2">
            {Array.from({ length: 3 - lane % 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
