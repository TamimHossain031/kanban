import { BoardTree, Column, MoveTaskVars } from './types';

/**
 * Pure, unit-testable core of the optimistic move. Splice the task out of its
 * source column and into the target column at `targetIndex`. Reused for both
 * same-column and cross-column moves — exactly the server's semantics, minus
 * the fractional key (the server owns positions; the client only needs order).
 */
export function applyMoveLocally(board: BoardTree, vars: MoveTaskVars): BoardTree {
  const { taskId, sourceColumnId, targetColumnId, targetIndex } = vars;

  // Find and detach the task.
  const sourceCol = board.columns.find((c) => c.id === sourceColumnId);
  const task = sourceCol?.tasks.find((t) => t.id === taskId);
  if (!sourceCol || !task) return board;

  const columns: Column[] = board.columns.map((col) => {
    // Remove from source.
    if (col.id === sourceColumnId) {
      return { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) };
    }
    return col;
  });

  // Insert into target (which may be the same column, now without the task).
  const next = columns.map((col) => {
    if (col.id !== targetColumnId) return col;
    const tasks = [...col.tasks];
    const clamped = Math.min(Math.max(targetIndex, 0), tasks.length);
    tasks.splice(clamped, 0, { ...task, columnId: targetColumnId });
    return { ...col, tasks };
  });

  return { ...board, columns: next };
}

/**
 * Given the visible order after a drag, compute the index the moved task
 * should occupy in the target column, excluding the task itself. This mirrors
 * the server's "siblings exclude the moved task" rule so optimistic and
 * authoritative order agree.
 */
export function indexInColumnExcluding(
  column: Column,
  movedTaskId: string,
  overTaskId: string | null,
): number {
  const without = column.tasks.filter((t) => t.id !== movedTaskId);
  if (!overTaskId) return without.length; // dropped on empty space → append
  const idx = without.findIndex((t) => t.id === overTaskId);
  return idx === -1 ? without.length : idx;
}
