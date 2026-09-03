import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class MoveColumnDto {
  @ApiProperty({ example: 1, description: 'Zero-based target index within the board' })
  @IsInt()
  @Min(0)
  targetIndex!: number;
}
