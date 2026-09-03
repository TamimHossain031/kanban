import { applyMoveLocally, indexInColumnExcluding } from './reorder';
import { BoardTree } from './types';

function task(id: string, columnId: string, position: string) {
  return {
    id,
    columnId,
    title: id,
    description: null,
    position,
    createdById: null,
    createdAt: '',
    updatedAt: '',
  };
}

function board(): BoardTree {
  return {
    id: 'b',
    title: 'B',
    createdAt: '',
    updatedAt: '',
    myRole: 'OWNER',
    members: [],
    columns: [
      {
        id: 'c1',
        title: 'Todo',
        position: 'a0',
        tasks: [task('t1', 'c1', 'a0'), task('t2', 'c1', 'a1'), task('t3', 'c1', 'a2')],
      },
      {
        id: 'c2',
        title: 'Doing',
        position: 'a1',
        tasks: [task('x', 'c2', 'a0')],
      },
    ],
  };
}

const ids = (b: BoardTree, colId: string) =>
  b.columns.find((c) => c.id === colId)!.tasks.map((t) => t.id);

describe('applyMoveLocally', () => {
  it('reorders within the same column (t1 → end)', () => {
    const next = applyMoveLocally(board(), {
      taskId: 't1',
      sourceColumnId: 'c1',
      targetColumnId: 'c1',
      targetIndex: 2,
    });
    expect(ids(next, 'c1')).toEqual(['t2', 't3', 't1']);
  });

  it('moves a task down one slot (the classic bug case)', () => {
    const next = applyMoveLocally(board(), {
      taskId: 't1',
      sourceColumnId: 'c1',
      targetColumnId: 'c1',
      targetIndex: 1,
    });
    expect(ids(next, 'c1')).toEqual(['t2', 't1', 't3']);
  });

  it('moves a task across columns at an index', () => {
    const next = applyMoveLocally(board(), {
      taskId: 't2',
      sourceColumnId: 'c1',
      targetColumnId: 'c2',
      targetIndex: 1,
    });
    expect(ids(next, 'c1')).toEqual(['t1', 't3']);
    expect(ids(next, 'c2')).toEqual(['x', 't2']);
  });

  it('clamps an out-of-range index', () => {
    const next = applyMoveLocally(board(), {
      taskId: 't1',
      sourceColumnId: 'c1',
      targetColumnId: 'c1',
      targetIndex: 99,
    });
    expect(ids(next, 'c1')).toEqual(['t2', 't3', 't1']);
  });

  it('is a no-op for an unknown task', () => {
    const next = applyMoveLocally(board(), {
      taskId: 'nope',
      sourceColumnId: 'c1',
      targetColumnId: 'c2',
      targetIndex: 0,
    });
    expect(ids(next, 'c1')).toEqual(['t1', 't2', 't3']);
    expect(ids(next, 'c2')).toEqual(['x']);
  });
});

describe('indexInColumnExcluding', () => {
  const b = board();
  const c1 = b.columns[0];

  it('returns append index when dropped on empty space', () => {
    expect(indexInColumnExcluding(c1, 't1', null)).toBe(2); // 3 tasks - moved
  });

  it('returns the over-task index excluding the moved task', () => {
    // Moving t1 over t3: without t1 → [t2, t3], t3 is at index 1.
    expect(indexInColumnExcluding(c1, 't1', 't3')).toBe(1);
  });
});
