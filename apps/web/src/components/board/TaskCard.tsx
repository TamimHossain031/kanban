'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/cn';
import { Task } from '@/features/boards/types';

/** Deterministic spine color — a light touch of "priority" from the title. */
function spineFor(task: Task): string {
  const t = task.title.toLowerCase();
  if (/fix|bug|urgent|race|auth/.test(t)) return 'var(--spine-urgent)';
  if (/idea|maybe|explore|spike/.test(t)) return 'var(--spine-idea)';
  return 'var(--spine-normal)';
}

interface TaskCardProps {
  task: Task;
  canEdit: boolean;
  onOpen: (task: Task) => void;
  /** true when rendered inside the DragOverlay (the only elevated card). */
  overlay?: boolean;
}

export function TaskCard({ task, canEdit, onOpen, overlay }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { type: 'task', columnId: task.columnId },
      disabled: !canEdit,
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    borderLeftColor: spineFor(task),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.title}`}
      className={cn(
        'group select-none rounded-card border border-rule border-l-2 bg-surface px-3 py-2.5',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        // At rest: no shadow. Elevation is reserved for the dragging card.
        overlay
          ? 'rotate-[1.5deg] scale-[1.02] shadow-drag'
          : isDragging
            ? 'opacity-40'
            : 'hover:border-accent/60',
      )}
    >
      <p className="text-sm leading-snug text-ink">{task.title}</p>
      {task.description && (
        <p className="mt-1 line-clamp-2 text-[12px] text-ink-muted">{task.description}</p>
      )}
    </div>
  );
}
