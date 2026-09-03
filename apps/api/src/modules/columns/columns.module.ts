import { Module } from '@nestjs/common';
import { BoardRoleGuard } from '../../common/guards/board-role.guard';
import { BoardsModule } from '../boards/boards.module';
import { ColumnsController } from './columns.controller';
import { ColumnsService } from './columns.service';

@Module({
  imports: [BoardsModule],
  controllers: [ColumnsController],
  providers: [ColumnsService, BoardRoleGuard],
})
export class ColumnsModule {}
