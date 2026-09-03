'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Column, Task } from '@/features/boards/types';
import { TaskComposer } from './TaskComposer';

interface MobileBoardProps {
  columns: Column[];
  canEdit: boolean;
  onOpenTask: (task: Task) => void;
  onAddTask: (columnId: string, title: string) => void;
}

/**
 * Drag-and-drop on a 380px screen is a trap. Show one lane at a time with a
 * segmented switcher; moving a card happens through the task dialog's
 * "Move to…" select, which calls the same move endpoint.
 */
export function MobileBoard({ columns, canEdit, onOpenTask, onAddTask }: MobileBoardProps) {
  const [active, setActive] = useState(0);
  const column = columns[active];
  if (!column) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Segmented lane switcher */}
      <div className="flex gap-1 overflow-x-auto border-b border-rule bg-surface p-2">
        {columns.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setActive(i)}
            className={cn(
              'shrink-0 rounded-card px-3 py-1.5 text-[13px] font-medium',
              i === active ? 'bg-accent text-white' : 'text-ink-muted hover:bg-canvas',
            )}
          >
            {c.title}
            <span className="tabular ml-1.5 opacity-80">{c.tasks.length}</span>
          </button>
        ))}
      </div>

      <div className="graph-paper flex-1 space-y-2 overflow-y-auto p-3">
        {column.tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onOpenTask(task)}
            className="block w-full rounded-card border border-rule border-l-2 border-l-accent bg-surface px-3 py-2.5 text-left"
          >
            <p className="text-sm text-ink">{task.title}</p>
            {task.description && (
              <p className="mt-1 line-clamp-2 text-[12px] text-ink-muted">{task.description}</p>
            )}
          </button>
        ))}

        {column.tasks.length === 0 && (
          <div className="grid h-16 place-items-center rounded-card border border-dashed border-rule text-[12px] text-ink-muted">
            No cards yet
          </div>
        )}

        {canEdit && (
          <div className="pt-1">
            <TaskComposer onAdd={(title) => onAddTask(column.id, title)} />
          </div>
        )}
      </div>
    </div>
  );
}
