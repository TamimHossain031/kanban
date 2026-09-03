'use client';

import { apiPublic, apiRequest } from '@/lib/api-client';
import {
  AuthResult,
  AuthUser,
  BoardMember,
  BoardRole,
  BoardSummary,
  BoardTree,
  Column,
  Task,
} from './types';

export const api = {
  // ── auth ──────────────────────────────────────────────
  register: (email: string, name: string, password: string) =>
    apiPublic<AuthResult>('/auth/register', { email, name, password }),

  login: (email: string, password: string) =>
    apiPublic<AuthResult>('/auth/login', { email, password }),

  me: () => apiRequest<AuthUser>('/auth/me'),

  // ── boards ────────────────────────────────────────────
  listBoards: () => apiRequest<BoardSummary[]>('/boards'),

  getBoard: (boardId: string) => apiRequest<BoardTree>(`/boards/${boardId}`),

  createBoard: (title: string) =>
    apiRequest<BoardSummary>('/boards', { method: 'POST', body: { title } }),

  renameBoard: (boardId: string, title: string) =>
    apiRequest<BoardTree>(`/boards/${boardId}`, { method: 'PATCH', body: { title } }),

  deleteBoard: (boardId: string) =>
    apiRequest<{ deleted: boolean }>(`/boards/${boardId}`, { method: 'DELETE' }),

  // ── members / sharing ─────────────────────────────────
  addMember: (boardId: string, email: string, role: BoardRole) =>
    apiRequest<BoardMember>(`/boards/${boardId}/members`, {
      method: 'POST',
      body: { email, role },
    }),

  updateMember: (boardId: string, userId: string, role: BoardRole) =>
    apiRequest<BoardMember>(`/boards/${boardId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
    }),

  removeMember: (boardId: string, userId: string) =>
    apiRequest<{ removed: boolean }>(`/boards/${boardId}/members/${userId}`, {
      method: 'DELETE',
    }),

  // ── columns ───────────────────────────────────────────
  createColumn: (boardId: string, title: string) =>
    apiRequest<Column>(`/boards/${boardId}/columns`, { method: 'POST', body: { title } }),

  renameColumn: (columnId: string, title: string) =>
    apiRequest<Column>(`/columns/${columnId}`, { method: 'PATCH', body: { title } }),

  deleteColumn: (columnId: string) =>
    apiRequest<{ deleted: boolean }>(`/columns/${columnId}`, { method: 'DELETE' }),

  moveColumn: (columnId: string, targetIndex: number) =>
    apiRequest<Column>(`/columns/${columnId}/move`, {
      method: 'PATCH',
      body: { targetIndex },
    }),

  // ── tasks ─────────────────────────────────────────────
  createTask: (columnId: string, title: string, description?: string) =>
    apiRequest<Task>(`/columns/${columnId}/tasks`, {
      method: 'POST',
      body: { title, ...(description ? { description } : {}) },
    }),

  updateTask: (taskId: string, patch: { title?: string; description?: string | null }) =>
    apiRequest<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: patch }),

  deleteTask: (taskId: string) =>
    apiRequest<{ deleted: boolean }>(`/tasks/${taskId}`, { method: 'DELETE' }),

  moveTask: (taskId: string, targetColumnId: string, targetIndex: number) =>
    apiRequest<Task>(`/tasks/${taskId}/move`, {
      method: 'PATCH',
      body: { targetColumnId, targetIndex },
    }),
};
