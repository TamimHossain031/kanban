'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Column, Task } from '@/features/boards/types';
import { ColumnLane } from './ColumnLane';
import { TaskCard } from './TaskCard';

interface BoardCanvasProps {
  columns: Column[];
  canEdit: boolean;
  onOpenTask: (task: Task) => void;
  onAddTask: (columnId: string, title: string) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onMoveTask: (v: {
    taskId: string;
    sourceColumnId: string;
    targetColumnId: string;
    targetIndex: number;
  }) => void;
  onMoveColumn: (v: { columnId: string; targetIndex: number }) => void;
}

/** Signature of the server order, so we only resync when it actually changes. */
function orderSignature(columns: Column[]): string {
  return columns.map((c) => `${c.id}:${c.tasks.map((t) => t.id).join(',')}`).join('|');
}

export function BoardCanvas(props: BoardCanvasProps) {
  const { columns: serverColumns, canEdit, onMoveTask, onMoveColumn } = props;

  // Local mirror for smooth cross-container dragging; server order is the truth.
  const [cols, setCols] = useState<Column[]>(serverColumns);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const dragSourceColumn = useRef<string | null>(null);
  const isDragging = activeTask !== null || activeColumn !== null;

  // Resync from server whenever its order changes and we're not mid-drag.
  const serverSig = orderSignature(serverColumns);
  useEffect(() => {
    if (!isDragging) setCols(serverColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverSig]);

  const sensors = useSensors(
    // distance:6 so a click to open a card doesn't start a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnIds = useMemo(() => cols.map((c) => c.id), [cols]);

  const findContainerId = (id: string): string | null => {
    if (id.startsWith('dropzone:')) return id.slice('dropzone:'.length);
    if (cols.some((c) => c.id === id)) return id; // a column id
    const owner = cols.find((c) => c.tasks.some((t) => t.id === id));
    return owner?.id ?? null;
  };

  const findTask = (id: string): Task | undefined =>
    cols.flatMap((c) => c.tasks).find((t) => t.id === id);

  function onDragStart(e: DragStartEvent) {
    const type = e.active.data.current?.type;
    if (type === 'task') {
      const task = findTask(String(e.active.id));
      if (task) {
        setActiveTask(task);
        dragSourceColumn.current = task.columnId;
      }
    } else if (type === 'column') {
      setActiveColumn(cols.find((c) => c.id === e.active.id) ?? null);
    }
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over || active.data.current?.type !== 'task') return;

    const activeContainer = findContainerId(String(active.id));
    const overContainer = findContainerId(String(over.id));
    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setCols((prev) => {
      const from = prev.find((c) => c.id === activeContainer);
      const to = prev.find((c) => c.id === overContainer);
      if (!from || !to) return prev;

      const moving = from.tasks.find((t) => t.id === active.id);
      if (!moving) return prev;

      // Index in the target container to insert at.
      const overIsTask = over.data.current?.type === 'task';
      const overIndex = overIsTask ? to.tasks.findIndex((t) => t.id === over.id) : to.tasks.length;
      const insertAt = overIndex >= 0 ? overIndex : to.tasks.length;

      return prev.map((c) => {
        if (c.id === activeContainer) {
          return { ...c, tasks: c.tasks.filter((t) => t.id !== active.id) };
        }
        if (c.id === overContainer) {
          const next = [...c.tasks];
          next.splice(insertAt, 0, { ...moving, columnId: overContainer });
          return { ...c, tasks: next };
        }
        return c;
      });
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const type = active.data.current?.type;

    // ── Column reorder ──
    if (type === 'column') {
      setActiveColumn(null);
      if (over && active.id !== over.id) {
        const oldIndex = cols.findIndex((c) => c.id === active.id);
        const overContainer = findContainerId(String(over.id));
        const newIndex = cols.findIndex((c) => c.id === overContainer);
        if (oldIndex !== -1 && newIndex !== -1) {
          setCols((prev) => arrayMove(prev, oldIndex, newIndex));
          onMoveColumn({ columnId: String(active.id), targetIndex: newIndex });
        }
      }
      return;
    }

    // ── Task move ──
    if (type === 'task') {
      const source = dragSourceColumn.current;
      setActiveTask(null);
      dragSourceColumn.current = null;
      if (!over || !source) return;

      const targetContainer = findContainerId(String(over.id));
      if (!targetContainer) return;

      // Reorder within the (post-dragOver) target container for same-column drops.
      let finalCols = cols;
      const overIsTask = over.data.current?.type === 'task';
      if (overIsTask) {
        const container = cols.find((c) => c.id === targetContainer);
        if (container) {
          const oldIndex = container.tasks.findIndex((t) => t.id === active.id);
          const newIndex = container.tasks.findIndex((t) => t.id === over.id);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            finalCols = cols.map((c) =>
              c.id === targetContainer
                ? { ...c, tasks: arrayMove(c.tasks, oldIndex, newIndex) }
                : c,
            );
            setCols(finalCols);
          }
        }
      }

      const targetIndex = finalCols
        .find((c) => c.id === targetContainer)!
        .tasks.findIndex((t) => t.id === active.id);

      onMoveTask({
        taskId: String(active.id),
        sourceColumnId: source,
        targetColumnId: targetContainer,
        targetIndex: targetIndex < 0 ? 0 : targetIndex,
      });
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveTask(null);
        setActiveColumn(null);
        setCols(serverColumns);
      }}
    >
      <div className="flex h-full items-start gap-4">
        <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
          {cols.map((column) => (
            <ColumnLane
              key={column.id}
              column={column}
              canEdit={canEdit}
              onOpenTask={props.onOpenTask}
              onAddTask={props.onAddTask}
              onRenameColumn={props.onRenameColumn}
              onDeleteColumn={props.onDeleteColumn}
            />
          ))}
        </SortableContext>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <TaskCard task={activeTask} canEdit={canEdit} onOpen={() => {}} overlay />
        ) : activeColumn ? (
          <div className="w-72 rounded-card border border-accent bg-surface px-2 py-1.5 text-[13px] font-medium text-ink shadow-drag">
            {activeColumn.title}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
