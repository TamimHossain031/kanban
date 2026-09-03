import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BoardRole } from '@prisma/client';
import { BoardRoles } from '../../common/decorators/board-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BoardRoleGuard } from '../../common/guards/board-role.guard';
import { ColumnsService } from './columns.service';
import { CreateColumnDto } from './dto/create-column.dto';
import { MoveColumnDto } from './dto/move-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';

@ApiTags('columns')
@ApiBearerAuth()
@Controller()
export class ColumnsController {
  constructor(private readonly columns: ColumnsService) {}

  /**
   * Create under a board — the route carries :boardId, so BoardRoleGuard can
   * authorize at the controller edge (OWNER or EDITOR).
   */
  @Post('boards/:boardId/columns')
  @UseGuards(BoardRoleGuard)
  @BoardRoles(BoardRole.OWNER, BoardRole.EDITOR)
  @ApiOperation({ summary: 'Add a column to a board (appends to the end)' })
  create(
    @CurrentUser('id') userId: string,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.columns.create(userId, boardId, dto);
  }

  @Patch('columns/:id')
  @ApiOperation({ summary: 'Rename a column (EDITOR/OWNER)' })
  rename(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.columns.rename(userId, id, dto);
  }

  @Delete('columns/:id')
  @ApiOperation({ summary: 'Delete a column and its tasks (EDITOR/OWNER)' })
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.columns.remove(userId, id);
  }

  @Patch('columns/:id/move')
  @ApiOperation({ summary: 'Reorder a column within its board (EDITOR/OWNER)' })
  move(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveColumnDto,
  ) {
    return this.columns.move(userId, id, dto);
  }
}
