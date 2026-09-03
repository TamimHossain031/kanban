import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class MoveTaskDto {
  @ApiProperty({ description: 'Destination column (must be on the same board)' })
  @IsUUID()
  targetColumnId!: string;

  @ApiProperty({ example: 2, description: 'Zero-based index within the target column' })
  @IsInt()
  @Min(0)
  targetIndex!: number;
}
