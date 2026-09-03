'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export const boardKeys = {
  all: ['boards'] as const,
  list: () => [...boardKeys.all, 'list'] as const,
  detail: (boardId: string) => ['board', boardId] as const,
};

export function useBoards() {
  return useQuery({
    queryKey: boardKeys.list(),
    queryFn: api.listBoards,
  });
}

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: boardKeys.detail(boardId),
    queryFn: () => api.getBoard(boardId),
    enabled: Boolean(boardId),
  });
}
