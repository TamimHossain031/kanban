import { ApiProperty } from '@nestjs/swagger';
import { BoardRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberDto {
  @ApiProperty({ enum: BoardRole, example: BoardRole.VIEWER })
  @IsEnum(BoardRole)
  role!: BoardRole;
}
