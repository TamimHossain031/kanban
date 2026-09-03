import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BoardsService } from './boards.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateBoardDto } from './dto/create-board.dto';
import { UpdateBoardDto } from './dto/update-board.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@ApiTags('boards')
@ApiBearerAuth()
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  @ApiOperation({ summary: 'List boards the current user is a member of' })
  list(@CurrentUser('id') userId: string) {
    return this.boards.listForUser(userId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a board; creator becomes OWNER' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBoardDto) {
    return this.boards.create(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Full board tree: columns + tasks + members' })
  get(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.boards.getTree(userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a board (OWNER only)' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boards.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a board and everything in it (OWNER only)' })
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.boards.remove(userId, id);
  }

  // ── Sharing (OWNER only) ─────────────────────────────────────────

  @Get(':boardId/members')
  @ApiOperation({ summary: 'List members of a board' })
  listMembers(
    @CurrentUser('id') userId: string,
    @Param('boardId', ParseUUIDPipe) boardId: string,
  ) {
    return this.boards.listMembers(userId, boardId);
  }

  @Post(':boardId/members')
  @ApiOperation({ summary: 'Share a board with a registered user' })
  addMember(
    @CurrentUser('id') userId: string,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.boards.addMember(userId, boardId, dto);
  }

  @Patch(':boardId/members/:memberId')
  @ApiOperation({ summary: "Change a member's role" })
  updateMember(
    @CurrentUser('id') userId: string,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.boards.updateMember(userId, boardId, memberId, dto);
  }

  @Delete(':boardId/members/:memberId')
  @ApiOperation({ summary: 'Remove a member from a board' })
  removeMember(
    @CurrentUser('id') userId: string,
    @Param('boardId', ParseUUIDPipe) boardId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.boards.removeMember(userId, boardId, memberId);
  }
}
