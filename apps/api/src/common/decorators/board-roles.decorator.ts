import { SetMetadata } from '@nestjs/common';
import { BoardRole } from '@prisma/client';

export const BOARD_ROLES_KEY = 'boardRoles';

/**
 * Declare which board roles may hit a controller method whose route carries a
 * `:boardId` param. Enforced by BoardRoleGuard. For nested resources
 * (task → column → board) authorize in the service instead, where the chain
 * can be resolved.
 */
export const BoardRoles = (...roles: BoardRole[]) => SetMetadata(BOARD_ROLES_KEY, roles);
