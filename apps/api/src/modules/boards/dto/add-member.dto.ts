import { ApiProperty } from '@nestjs/swagger';
import { BoardRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

/** Only EDITOR or VIEWER can be granted through sharing; OWNER is implicit. */
export class AddMemberDto {
  @ApiProperty({ example: 'grace@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: [BoardRole.EDITOR, BoardRole.VIEWER], example: BoardRole.EDITOR })
  @IsEnum(BoardRole)
  role!: BoardRole;
}
