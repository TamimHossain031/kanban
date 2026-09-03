'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AvatarStack } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { BoardSkeleton } from '@/components/ui/Skeleton';
import { BoardCanvas } from '@/components/board/BoardCanvas';
import { MobileBoard } from '@/components/board/MobileBoard';
import { ShareDialog } from '@/components/board/ShareDialog';
import { TaskDialog } from '@/components/board/TaskDialog';
import {
  useCreateColumn,
  useCreateTask,
  useDeleteColumn,
  useDeleteTask,
  useMoveColumn,
  useMoveTask,
  useRenameBoard,
  useRenameColumn,
  useUpdateTask,
} from '@/features/boards/mutations';
import { useBoard } from '@/features/boards/queries';
import { Task } from '@/features/boards/types';
import { useAuth } from '@/lib/use-auth';

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const { user } = useAuth();
  const { data: board, isLoading, isError, error } = useBoard(boardId);

  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Mutations
  const moveTask = useMoveTask(boardId);
  const moveColumn = useMoveColumn(boardId);
  const createColumn = useCreateColumn(boardId);
  const renameColumn = useRenameColumn(boardId);
  const deleteColumn = useDeleteColumn(boardId);
  const createTask = useCreateTask(boardId);
  const updateTask = useUpdateTask(boardId);
  const deleteTask = useDeleteTask(boardId);
  const renameBoard = useRenameBoard(boardId);

  if (isLoading) return <BoardSkeleton />;

  if (isError || !board) {
    const notFound = (error as { status?: number } | null)?.status === 404;
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <p className="mb-2 text-ink">
            {notFound ? "This board doesn't exist or isn't shared with you." : 'Could not load the board.'}
          </p>
          <Link href="/boards" className="font-medium text-accent hover:underline">
            ← Back to boards
          </Link>
        </div>
      </div>
    );
  }

  const canEdit = board.myRole === 'OWNER' || board.myRole === 'EDITOR';
  const isOwner = board.myRole === 'OWNER';
  const memberNames = board.members.map((m) => m.user.name);

  const addColumn = () => {
    const title = prompt('New column title');
    if (title?.trim()) createColumn.mutate(title.trim());
  };

  const commitBoardTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== board.title) renameBoard.mutate(trimmed);
    setEditingTitle(false);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* Board header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-rule bg-surface px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/boards" className="text-ink-muted hover:text-ink" aria-label="Back">
            ←
          </Link>
          {editingTitle && isOwner ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitBoardTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitBoardTitle();
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              className="rounded border border-rule bg-surface px-2 py-1 text-base font-semibold outline-none focus:border-accent"
            />
          ) : (
            <h1
              className="truncate text-base font-semibold text-ink"
              onDoubleClick={() => {
                if (isOwner) {
                  setTitleDraft(board.title);
                  setEditingTitle(true);
                }
              }}
              title={isOwner ? 'Double-click to rename' : board.title}
            >
              {board.title}
            </h1>
          )}
          {!canEdit && (
            <span className="rounded bg-canvas px-2 py-0.5 text-[12px] font-medium text-ink-muted">
              View only
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <AvatarStack names={memberNames} />
          {isOwner && (
            <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}>
              Share
            </Button>
          )}
        </div>
      </div>

      {/* Desktop canvas */}
      <div className="graph-paper hidden flex-1 overflow-x-auto p-4 lg:block">
        <div className="flex h-full items-start gap-4">
          <BoardCanvas
            columns={board.columns}
            canEdit={canEdit}
            onOpenTask={setOpenTask}
            onAddTask={(columnId, title) => createTask.mutate({ columnId, title })}
            onRenameColumn={(columnId, title) => renameColumn.mutate({ columnId, title })}
            onDeleteColumn={(columnId) => deleteColumn.mutate(columnId)}
            onMoveTask={(v) => moveTask.mutate(v)}
            onMoveColumn={(v) => moveColumn.mutate(v)}
          />
          {canEdit && (
            <button
              onClick={addColumn}
              className="mt-0 h-9 w-40 shrink-0 rounded-card border border-dashed border-rule text-[13px] text-ink-muted hover:border-accent hover:text-accent"
            >
              + Add column
            </button>
          )}
        </div>
      </div>

      {/* Mobile: one lane at a time */}
      <div className="flex-1 overflow-hidden lg:hidden">
        <MobileBoard
          columns={board.columns}
          canEdit={canEdit}
          onOpenTask={setOpenTask}
          onAddTask={(columnId, title) => createTask.mutate({ columnId, title })}
        />
      </div>

      {/* Dialogs */}
      <TaskDialog
        task={openTask}
        columns={board.columns}
        canEdit={canEdit}
        onClose={() => setOpenTask(null)}
        onSave={(taskId, patch) => updateTask.mutate({ taskId, ...patch })}
        onDelete={(taskId) => deleteTask.mutate(taskId)}
        onMoveTo={(taskId, targetColumnId) => {
          if (targetColumnId === openTask?.columnId) return;
          moveTask.mutate({
            taskId,
            sourceColumnId: openTask!.columnId,
            targetColumnId,
            targetIndex: 9999, // append; server clamps
          });
          setOpenTask(null);
        }}
      />

      {isOwner && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          boardId={boardId}
          members={board.members}
          currentUserId={user?.id ?? ''}
        />
      )}
    </div>
  );
}
