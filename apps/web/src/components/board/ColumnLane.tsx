'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { Column, Task } from '@/features/boards/types';
import { TaskCard } from './TaskCard';
import { TaskComposer } from './TaskComposer';

interface ColumnLaneProps {
  column: Column;
  canEdit: boolean;
  onOpenTask: (task: Task) => void;
  onAddTask: (columnId: string, title: string) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onDeleteColumn: (columnId: string) => void;
}

export function ColumnLane({
  column,
  canEdit,
  onOpenTask,
  onAddTask,
  onRenameColumn,
  onDeleteColumn,
}: ColumnLaneProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(column.title);

  // Column-level sortable (reorder lanes). Drag handle lives on the header.
  const {
    setNodeRef: setColumnRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: 'column' }, disabled: !canEdit });

  // A droppable that covers the whole lane so drops onto empty space or the
  // gaps between cards resolve to this column.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `dropzone:${column.id}`,
    data: { type: 'column-dropzone', columnId: column.id },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const commitRename = () => {
    const trimmed = title.trim();
    if (trimmed && trimmed !== column.title) onRenameColumn(column.id, trimmed);
    else setTitle(column.title);
    setEditing(false);
  };

  return (
    <section
      ref={setColumnRef}
      style={style}
      className="flex max-h-full w-72 shrink-0 flex-col"
    >
      {/* Header — count in tabular numerals so it doesn't jitter. */}
      <div className="mb-2 flex items-center gap-2 px-1">
        {editing ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setTitle(column.title);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-rule bg-surface px-1.5 py-0.5 text-[13px] font-medium outline-none focus:border-accent"
          />
        ) : (
          <button
            {...attributes}
            {...listeners}
            onDoubleClick={() => canEdit && setEditing(true)}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2 text-[13px] font-medium text-ink',
              canEdit && 'cursor-grab active:cursor-grabbing',
            )}
            title={canEdit ? 'Drag to reorder · double-click to rename' : column.title}
          >
            <span className="truncate">{column.title}</span>
            <span className="tabular text-ink-muted">{column.tasks.length}</span>
          </button>
        )}
        {canEdit && !editing && (
          <button
            onClick={() => {
              if (confirm(`Delete column "${column.title}" and its tasks?`)) {
                onDeleteColumn(column.id);
              }
            }}
            className="text-ink-muted hover:text-spine-urgent"
            aria-label="Delete column"
            title="Delete column"
          >
            ✕
          </button>
        )}
      </div>

      {/* Task list / droppable */}
      <div
        ref={setDropRef}
        className={cn(
          'lane-scroll flex-1 space-y-2 overflow-y-auto rounded-card p-1 transition-colors',
          isOver && 'bg-accent-wash ring-1 ring-accent',
        )}
      >
        <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} canEdit={canEdit} onOpen={onOpenTask} />
          ))}
        </SortableContext>

        {column.tasks.length === 0 && (
          <div className="grid h-16 place-items-center rounded-card border border-dashed border-rule text-[12px] text-ink-muted">
            Drop a card here
          </div>
        )}
      </div>

      {canEdit && (
        <div className="mt-1 px-1">
          <TaskComposer onAdd={(title) => onAddTask(column.id, title)} />
        </div>
      )}
    </section>
  );
}
