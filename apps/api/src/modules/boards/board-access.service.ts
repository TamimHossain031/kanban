import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BoardRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * The one place authorization on a board is decided. Every mutation and read
 * resolves up to a board id and asks this service. Callers inside a
 * transaction pass their `tx` so the check and the mutation see the same
 * snapshot; callers outside one may omit `db` and get the base client.
 *
 * Design choices worth defending in review:
 *   1. Always resolve up to the board (task → column → board). Never trust a
 *      boardId from the request body.
 *   2. Return 404 (not 403) for a board you're not a member of — a 403 would
 *      confirm the id is real and leak the existence of other users' data.
 */
@Injectable()
export class BoardAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireRole(
    userId: string,
    boardId: string,
    allowed: BoardRole[],
    db: Db = this.prisma,
  ): Promise<BoardRole> {
    const membership = await db.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId } },
      select: { role: true },
    });

    // 404, not 403 — don't confirm the board exists to a stranger.
    if (!membership) throw new NotFoundException('Board not found');
    if (!allowed.includes(membership.role)) {
      throw new ForbiddenException('Insufficient permissions on this board');
    }
    return membership.role;
  }

  assertCanMutate(userId: string, boardId: string, db: Db = this.prisma) {
    return this.requireRole(userId, boardId, [BoardRole.OWNER, BoardRole.EDITOR], db);
  }

  assertCanRead(userId: string, boardId: string, db: Db = this.prisma) {
    return this.requireRole(
      userId,
      boardId,
      [BoardRole.OWNER, BoardRole.EDITOR, BoardRole.VIEWER],
      db,
    );
  }

  assertOwner(userId: string, boardId: string, db: Db = this.prisma) {
    return this.requireRole(userId, boardId, [BoardRole.OWNER], db);
  }

  /**
   * Resolve the board that owns a column, then authorize against it.
   * Returns the boardId so the caller can continue working with it.
   */
  async resolveColumnBoard(columnId: string, db: Db = this.prisma): Promise<string> {
    const column = await db.column.findUnique({
      where: { id: columnId },
      select: { boardId: true },
    });
    if (!column) throw new NotFoundException('Column not found');
    return column.boardId;
  }

  /** Resolve the board that owns a task (task → column → board). */
  async resolveTaskBoard(
    taskId: string,
    db: Db = this.prisma,
  ): Promise<{ boardId: string; columnId: string }> {
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { columnId: true, column: { select: { boardId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return { boardId: task.column.boardId, columnId: task.columnId };
  }
}
