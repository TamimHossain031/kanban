import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { BoardAccessService } from './board-access.service';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({
  imports: [UsersModule],
  controllers: [BoardsController],
  providers: [BoardsService, BoardAccessService],
  // Exported so Columns/Tasks modules (and BoardRoleGuard) can authorize.
  exports: [BoardAccessService],
})
export class BoardsModule {}
