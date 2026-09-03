import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BoardAccessService } from '../boards/board-access.service';
import { OrderingService } from '../ordering/ordering.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

const TASK_SELECT = {
  id: true,
  columnId: true,
  title: true,
  description: true,
  position: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly ordering: OrderingService,
  ) {}

  /** Create a task appended to the end of a column. */
  async create(userId: string, columnId: string, dto: CreateTaskDto) {
    const boardId = await this.access.resolveColumnBoard(columnId);
    await this.access.assertCanMutate(userId, boardId);

    const last = await this.prisma.task.findFirst({
      where: { columnId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = this.ordering.keyForAppend(last?.position ?? null);

    return this.prisma.task.create({
      data: {
        columnId,
        title: dto.title,
        description: dto.description ?? null,
        position,
        createdById: userId,
      },
      select: TASK_SELECT,
    });
  }

  async update(userId: string, taskId: string, dto: UpdateTaskDto) {
    const { boardId } = await this.access.resolveTaskBoard(taskId);
    await this.access.assertCanMutate(userId, boardId);

    const data: Prisma.TaskUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;

    return this.prisma.task.update({
      where: { id: taskId },
      data,
      select: TASK_SELECT,
    });
  }

  async remove(userId: string, taskId: string) {
    const { boardId } = await this.access.resolveTaskBoard(taskId);
    await this.access.assertCanMutate(userId, boardId);

    await this.prisma.task.delete({ where: { id: taskId } });
    return { id: taskId, deleted: true };
  }

  /**
   * Move a task to a target index within a target column. The heart of the
   * assessment. Every line below is deliberate — see docs/architecture.md.
   */
  async move(userId: string, taskId: string, dto: MoveTaskDto) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Resolve the task and the board it belongs to.
      const task = await tx.task.findUnique({
        where: { id: taskId },
        select: { id: true, columnId: true, column: { select: { boardId: true } } },
      });
      if (!task) throw new NotFoundException('Task not found');
      const boardId = task.column.boardId;

      // 2. Authorize INSIDE the transaction, on the resolved board — the thing
      //    we checked is the thing we mutate.
      await this.access.assertCanMutate(userId, boardId, tx);

      // 3. Serialize all moves on this board so two concurrent drags can't read
      //    the same neighbour pair and collide on the unique constraint.
      // Board.id is a text column (Prisma String), so compare text-to-text —
      // no ::uuid cast, which would fail with "operator does not exist".
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Board" WHERE id = ${boardId} FOR UPDATE`,
      );

      // 4. The target column must belong to the SAME board — blocks cross-board
      //    moves even if a hostile client sends someone else's column id.
      const target = await tx.column.findUnique({
        where: { id: dto.targetColumnId },
        select: { id: true, boardId: true },
      });
      if (!target) throw new NotFoundException('Target column not found');
      if (target.boardId !== boardId) {
        throw new ForbiddenException('Cannot move a task to another board');
      }

      // 5. Read neighbours, EXCLUDING the task being moved. Forgetting this is
      //    the #1 bug: dragging down one slot would otherwise no-op.
      const siblings = await tx.task.findMany({
        where: { columnId: target.id, id: { not: taskId } },
        orderBy: { position: 'asc' },
        select: { position: true },
      });

      const position = this.ordering.keyForIndex(
        siblings.map((s) => s.position),
        dto.targetIndex,
      );

      // 6. Exactly one write.
      return tx.task.update({
        where: { id: taskId },
        data: { columnId: target.id, position },
        select: { id: true, columnId: true, position: true, updatedAt: true },
      });
    });
  }
}
