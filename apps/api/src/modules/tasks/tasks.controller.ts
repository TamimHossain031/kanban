import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('columns/:columnId/tasks')
  @ApiOperation({ summary: 'Add a task to a column (appends to the end)' })
  create(
    @CurrentUser('id') userId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(userId, columnId, dto);
  }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Edit a task title/description (EDITOR/OWNER)' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(userId, id, dto);
  }

  @Delete('tasks/:id')
  @ApiOperation({ summary: 'Delete a task (EDITOR/OWNER)' })
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.remove(userId, id);
  }

  @Patch('tasks/:id/move')
  @ApiOperation({
    summary: 'Move a task to a target column + index (EDITOR/OWNER)',
    description:
      'Dedicated endpoint: moving has different validation, locking and ' +
      'permission semantics than editing a title. The client sends an index; ' +
      'the server owns position generation.',
  })
  move(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasks.move(userId, id, dto);
  }
}
