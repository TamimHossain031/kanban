'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './api';
import { applyMoveLocally } from './reorder';
import { boardKeys } from './queries';
import { BoardRole, BoardTree, MoveTaskVars, Task } from './types';

// ─── The centerpiece: optimistic task move with rollback ──────────────
export function useMoveTask(boardId: string) {
  const qc = useQueryClient();
  const key = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: (v: MoveTaskVars) => api.moveTask(v.taskId, v.targetColumnId, v.targetIndex),

    onMutate: async (v: MoveTaskVars) => {
      // Stop an in-flight refetch from overwriting our optimistic state.
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BoardTree>(key);
      qc.setQueryData<BoardTree>(key, (b) => (b ? applyMoveLocally(b, v) : b));
      return { previous };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous); // snap back
      toast.error('Could not move the task. Put back where it was.');
    },

    // Server is the source of truth once the dust settles.
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ─── Columns ──────────────────────────────────────────────────────────
export function useMoveColumn(boardId: string) {
  const qc = useQueryClient();
  const key = boardKeys.detail(boardId);

  return useMutation({
    mutationFn: (v: { columnId: string; targetIndex: number }) =>
      api.moveColumn(v.columnId, v.targetIndex),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BoardTree>(key);
      qc.setQueryData<BoardTree>(key, (b) => {
        if (!b) return b;
        const cols = [...b.columns];
        const from = cols.findIndex((c) => c.id === v.columnId);
        if (from === -1) return b;
        const [moved] = cols.splice(from, 1);
        const clamped = Math.min(Math.max(v.targetIndex, 0), cols.length);
        cols.splice(clamped, 0, moved);
        return { ...b, columns: cols };
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error('Could not reorder the column.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.createColumn(boardId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
    onError: () => toast.error('Could not create the column.'),
  });
}

export function useRenameColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { columnId: string; title: string }) =>
      api.renameColumn(v.columnId, v.title),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
    onError: () => toast.error('Could not rename the column.'),
  });
}

export function useDeleteColumn(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (columnId: string) => api.deleteColumn(columnId),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
    onError: () => toast.error('Could not delete the column.'),
  });
}

// ─── Tasks ────────────────────────────────────────────────────────────
export function useCreateTask(boardId: string) {
  const qc = useQueryClient();
  const key = boardKeys.detail(boardId);
  return useMutation({
    mutationFn: (v: { columnId: string; title: string; description?: string }) =>
      api.createTask(v.columnId, v.title, v.description),
    onMutate: async (v) => {
      // Optimistic create with a temp id, replaced on settle.
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BoardTree>(key);
      const tempId = `temp-${Date.now()}`;
      qc.setQueryData<BoardTree>(key, (b) => {
        if (!b) return b;
        const optimistic: Task = {
          id: tempId,
          columnId: v.columnId,
          title: v.title,
          description: v.description ?? null,
          position: 'zzzz',
          createdById: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return {
          ...b,
          columns: b.columns.map((c) =>
            c.id === v.columnId ? { ...c, tasks: [...c.tasks, optimistic] } : c,
          ),
        };
      });
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
      toast.error('Could not add the task.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { taskId: string; title?: string; description?: string | null }) =>
      api.updateTask(v.taskId, { title: v.title, description: v.description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
    onError: () => toast.error('Could not save the task.'),
  });
}

export function useDeleteTask(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.deleteTask(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
    onError: () => toast.error('Could not delete the task.'),
  });
}

// ─── Boards & sharing ──────────────────────────────────────────────────
export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.createBoard(title),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.list() }),
    onError: () => toast.error('Could not create the board.'),
  });
}

export function useRenameBoard(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.renameBoard(boardId, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
      qc.invalidateQueries({ queryKey: boardKeys.list() });
    },
    onError: () => toast.error('Could not rename the board.'),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => api.deleteBoard(boardId),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.list() }),
    onError: () => toast.error('Could not delete the board.'),
  });
}

export function useAddMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; role: BoardRole }) =>
      api.addMember(boardId, v.email, v.role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
      toast.success('Member added.');
    },
    // Surface the server's precise message (404 unregistered, 409 duplicate…).
    onError: (e: Error) => toast.error(e.message || 'Could not add the member.'),
  });
}

export function useUpdateMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; role: BoardRole }) =>
      api.updateMember(boardId, v.userId, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
    onError: (e: Error) => toast.error(e.message || 'Could not update the member.'),
  });
}

export function useRemoveMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.removeMember(boardId, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
    onError: (e: Error) => toast.error(e.message || 'Could not remove the member.'),
  });
}
