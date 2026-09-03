import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BoardAccessService } from '../boards/board-access.service';
import { OrderingService } from '../ordering/ordering.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { MoveColumnDto } from './dto/move-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@Injectable()
export class ColumnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly ordering: OrderingService,
  ) {}

  /** Create a column appended to the end of the board. */
  async create(userId: string, boardId: string, dto: CreateColumnDto) {
    // Authorization for this route is enforced by BoardRoleGuard (has :boardId).
    const last = await this.prisma.column.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const position = this.ordering.keyForAppend(last?.position ?? null);

    return this.prisma.column.create({
      data: { boardId, title: dto.title, position },
      select: { id: true, boardId: true, title: true, position: true },
    });
  }

  async rename(userId: string, columnId: string, dto: UpdateColumnDto) {
    const boardId = await this.access.resolveColumnBoard(columnId);
    await this.access.assertCanMutate(userId, boardId);

    return this.prisma.column.update({
      where: { id: columnId },
      data: { title: dto.title },
      select: { id: true, boardId: true, title: true, position: true },
    });
  }

  async remove(userId: string, columnId: string) {
    const boardId = await this.access.resolveColumnBoard(columnId);
    await this.access.assertCanMutate(userId, boardId);

    await this.prisma.column.delete({ where: { id: columnId } });
    return { id: columnId, deleted: true };
  }

  /**
   * Reorder a column within its board. Same algorithm as task move:
   * serialize on the board row, read neighbours excluding self, one write.
   */
  async move(userId: string, columnId: string, dto: MoveColumnDto) {
    return this.prisma.$transaction(async (tx) => {
      const column = await tx.column.findUnique({
        where: { id: columnId },
        select: { id: true, boardId: true },
      });
      if (!column) throw new NotFoundException('Column not found');
      const boardId = column.boardId;

      await this.access.assertCanMutate(userId, boardId, tx);

      // Serialize all ordering changes on this board. Board.id is a text
      // column (Prisma String), so compare text-to-text (no ::uuid cast).
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "Board" WHERE id = ${boardId} FOR UPDATE`,
      );

      const siblings = await tx.column.findMany({
        where: { boardId, id: { not: columnId } },
        orderBy: { position: 'asc' },
        select: { position: true },
      });

      const position = this.ordering.keyForIndex(
        siblings.map((s) => s.position),
        dto.targetIndex,
      );

      return tx.column.update({
        where: { id: columnId },
        data: { position },
        select: { id: true, boardId: true, title: true, position: true },
      });
    });
  }
}
