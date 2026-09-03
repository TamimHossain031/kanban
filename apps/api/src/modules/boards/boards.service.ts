import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BoardRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SAFE_USER_SELECT, UsersService } from '../users/users.service';
import { BoardAccessService } from './board-access.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: BoardAccessService,
    private readonly users: UsersService,
  ) {}

  /** Boards the caller can see — filtered in the query, never in JS. */
  async listForUser(userId: string) {
    return this.prisma.board.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { columns: true, members: true } },
        members: {
          where: { userId },
          select: { role: true },
        },
      },
    });
  }

  /** Create the board and the creator's OWNER membership in one transaction. */
  async create(userId: string, dto: CreateBoardDto) {
    return this.prisma.board.create({
      data: {
        title: dto.title,
        members: { create: { userId, role: BoardRole.OWNER } },
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        members: { where: { userId }, select: { role: true } },
      },
    });
  }

  /**
   * The full board tree in one request: columns (ordered) → tasks (ordered),
   * plus members. One round trip renders the board — no N+1 per column.
   */
  async getTree(userId: string, boardId: string) {
    const role = await this.access.assertCanRead(userId, boardId);

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        columns: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            position: true,
            tasks: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                columnId: true,
                title: true,
                description: true,
                position: true,
                createdById: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        members: {
          orderBy: { addedAt: 'asc' },
          select: {
            userId: true,
            role: true,
            addedAt: true,
            user: { select: SAFE_USER_SELECT },
          },
        },
      },
    });

    if (!board) throw new NotFoundException('Board not found');
    // Surface the caller's own role so the client can gate UI.
    return { ...board, myRole: role };
  }

  async update(userId: string, boardId: string, dto: UpdateBoardDto) {
    await this.access.assertOwner(userId, boardId);
    return this.prisma.board.update({
      where: { id: boardId },
      data: { title: dto.title },
      select: { id: true, title: true, updatedAt: true },
    });
  }

  async remove(userId: string, boardId: string) {
    await this.access.assertOwner(userId, boardId);
    // Cascade deletes columns → tasks and memberships.
    await this.prisma.board.delete({ where: { id: boardId } });
    return { id: boardId, deleted: true };
  }

  // ── Sharing ──────────────────────────────────────────────────────

  async listMembers(userId: string, boardId: string) {
    await this.access.assertCanRead(userId, boardId);
    return this.prisma.boardMember.findMany({
      where: { boardId },
      orderBy: { addedAt: 'asc' },
      select: {
        userId: true,
        role: true,
        addedAt: true,
        user: { select: SAFE_USER_SELECT },
      },
    });
  }

  async addMember(ownerId: string, boardId: string, dto: AddMemberDto) {
    await this.access.assertOwner(ownerId, boardId);

    if (dto.role === BoardRole.OWNER) {
      throw new BadRequestException('Cannot grant OWNER via sharing');
    }

    const invitee = await this.users.findByEmail(dto.email);
    if (!invitee) {
      throw new NotFoundException(`No user registered with email ${dto.email}`);
    }

    const existing = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: invitee.id } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('User is already a member of this board');

    await this.prisma.boardMember.create({
      data: { boardId, userId: invitee.id, role: dto.role },
    });

    return {
      userId: invitee.id,
      role: dto.role,
      user: invitee,
    };
  }

  async updateMember(
    ownerId: string,
    boardId: string,
    targetUserId: string,
    dto: UpdateMemberDto,
  ) {
    await this.access.assertOwner(ownerId, boardId);

    const target = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found on this board');

    // Guard: never leave a board without an owner.
    if (target.role === BoardRole.OWNER && dto.role !== BoardRole.OWNER) {
      await this.assertNotLastOwner(boardId);
    }

    const updated = await this.prisma.boardMember.update({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      data: { role: dto.role },
      select: {
        userId: true,
        role: true,
        user: { select: SAFE_USER_SELECT },
      },
    });
    return updated;
  }

  async removeMember(ownerId: string, boardId: string, targetUserId: string) {
    await this.access.assertOwner(ownerId, boardId);

    const target = await this.prisma.boardMember.findUnique({
      where: { boardId_userId: { boardId, userId: targetUserId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found on this board');

    // Owner removing themselves is a footgun; require a role transfer first.
    if (targetUserId === ownerId) {
      throw new BadRequestException(
        'Owners cannot remove themselves. Transfer ownership or delete the board.',
      );
    }
    if (target.role === BoardRole.OWNER) {
      await this.assertNotLastOwner(boardId);
    }

    await this.prisma.boardMember.delete({
      where: { boardId_userId: { boardId, userId: targetUserId } },
    });
    return { userId: targetUserId, removed: true };
  }

  private async assertNotLastOwner(boardId: string) {
    const owners = await this.prisma.boardMember.count({
      where: { boardId, role: BoardRole.OWNER },
    });
    if (owners <= 1) {
      throw new BadRequestException('A board must always have at least one owner');
    }
  }
}
