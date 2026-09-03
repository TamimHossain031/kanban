export type BoardRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface Task {
  id: string;
  columnId: string;
  title: string;
  description: string | null;
  position: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Column {
  id: string;
  title: string;
  position: string;
  tasks: Task[];
}

export interface BoardMember {
  userId: string;
  role: BoardRole;
  addedAt: string;
  user: AuthUser;
}

/** The full board tree returned by GET /boards/:id */
export interface BoardTree {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
  members: BoardMember[];
  myRole: BoardRole;
}

/** Board list item from GET /boards */
export interface BoardSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count: { columns: number; members: number };
  members: { role: BoardRole }[];
}

export interface MoveTaskVars {
  taskId: string;
  targetColumnId: string;
  targetIndex: number;
  /** Source column, kept for optimistic rollback bookkeeping. */
  sourceColumnId: string;
}
