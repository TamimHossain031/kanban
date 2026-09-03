import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BoardRole } from '@prisma/client';
import { BoardAccessService } from '../../modules/boards/board-access.service';
import { BOARD_ROLES_KEY } from '../decorators/board-roles.decorator';

/**
 * Controller-level authorization for routes that carry a `:boardId` param.
 * Resolves the caller's membership on that board and enforces the roles
 * declared via `@BoardRoles(...)`. If no roles are declared, membership alone
 * (any role) is required. Nested resources authorize in the service instead.
 */
@Injectable()
export class BoardRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: BoardAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<BoardRole[]>(BOARD_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.id;
    const boardId: string = request.params?.boardId;

    // No board scope on this route — nothing for this guard to enforce.
    if (!boardId) return true;

    const allowed: BoardRole[] = roles ?? [
      BoardRole.OWNER,
      BoardRole.EDITOR,
      BoardRole.VIEWER,
    ];
    await this.access.requireRole(userId, boardId, allowed);
    return true;
  }
}
