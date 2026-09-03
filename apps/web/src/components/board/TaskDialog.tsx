'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Column, Task } from '@/features/boards/types';

interface TaskDialogProps {
  task: Task | null;
  columns: Column[];
  canEdit: boolean;
  onClose: () => void;
  onSave: (taskId: string, patch: { title: string; description: string | null }) => void;
  onDelete: (taskId: string) => void;
  /** Mobile / accessibility: move without dragging. */
  onMoveTo: (taskId: string, targetColumnId: string) => void;
}

export function TaskDialog({
  task,
  columns,
  canEdit,
  onClose,
  onSave,
  onDelete,
  onMoveTo,
}: TaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.description ?? '');
  }, [task]);

  if (!task) return null;

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave(task.id, { title: trimmed, description: description.trim() || null });
    onClose();
  };

  return (
    <Dialog open={Boolean(task)} onClose={onClose} title={canEdit ? 'Edit task' : 'Task'}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-muted">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit}
            className="w-full rounded-card border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-70"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink-muted">Description</span>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            placeholder={canEdit ? 'Add more detail…' : 'No description'}
            className="w-full resize-none rounded-card border border-rule bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-70"
          />
        </label>

        {canEdit && (
          <label className="block">
            <span className="mb-1 block text-[13px] font-medium text-ink-muted">Move to</span>
            <select
              value={task.columnId}
              onChange={(e) => onMoveTo(task.id, e.target.value)}
              className="w-full rounded-card border border-rule bg-surface px-2 py-2 text-sm outline-none focus:border-accent"
            >
              {columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {canEdit && (
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Delete this task?')) {
                  onDelete(task.id);
                  onClose();
                }
              }}
            >
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} disabled={!title.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
