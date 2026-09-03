'use client';

import { ReactNode } from 'react';

export const inputCls =
  'w-full rounded-card border border-rule bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent';

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-ink-muted">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[12px] text-spine-urgent">{error}</span>}
    </label>
  );
}

export function AuthShell({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="graph-paper flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-rule bg-surface p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-accent text-sm font-semibold text-white">
            K
          </span>
          <span className="text-base font-semibold text-ink">Mini Kanban</span>
        </div>
        <h1 className="mb-4 text-lg font-semibold text-ink">{title}</h1>
        {children}
        <p className="mt-5 text-[13px] text-ink-muted">{footer}</p>
      </div>
    </main>
  );
}
