'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

/** Inline "add a card" composer at the foot of a lane. */
export function TaskComposer({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    // keep composer open for rapid entry
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-card px-2 py-1.5 text-left text-[13px] text-ink-muted hover:bg-canvas hover:text-ink"
      >
        + Add card
      </button>
    );
  }

  return (
    <div className="space-y-1.5">
      <textarea
        autoFocus
        rows={2}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Card title…"
        className="w-full resize-none rounded-card border border-rule bg-surface px-2.5 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          className={cn(
            'rounded-card bg-accent px-2.5 py-1 text-[13px] font-medium text-white',
            !value.trim() && 'opacity-50',
          )}
        >
          Add
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setValue('');
          }}
          className="text-[13px] text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
