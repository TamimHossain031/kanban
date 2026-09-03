'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { useCreateBoard } from '@/features/boards/mutations';
import { useBoards } from '@/features/boards/queries';

export default function BoardsPage() {
  const { data: boards, isLoading } = useBoards();
  const createBoard = useCreateBoard();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await createBoard.mutateAsync(trimmed);
    setTitle('');
    setOpen(false);
  };

  return (
    <main className="graph-paper h-[100dvh] p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-ink">Your boards</h1>
          <Button onClick={() => setOpen(true)}>+ New board</Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : boards && boards.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {boards.map((b) => (
              <Link
                key={b.id}
                href={`/boards/${b.id}`}
                className="group rounded-card border border-rule bg-surface p-4 transition-colors hover:border-accent"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="font-medium text-ink group-hover:text-accent">{b.title}</h2>
                  <span className="rounded bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                    {b.members[0]?.role ?? 'MEMBER'}
                  </span>
                </div>
                <p className="text-[13px] text-ink-muted tabular">
                  {b._count.columns} columns · {b._count.members} members
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="grid place-items-center rounded-lg border border-dashed border-rule bg-surface/50 py-20 text-center">
            <p className="mb-3 text-ink-muted">No boards yet. Create one to start planning.</p>
            <Button onClick={() => setOpen(true)}>Create board</Button>
          </div>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="New board">
        <div className="space-y-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. Product Launch"
            className="w-full rounded-card border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={createBoard.isPending || !title.trim()}>
              {createBoard.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </div>
      </Dialog>
    </main>
  );
}
