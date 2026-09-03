import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBoardDto {
  @ApiProperty({ example: 'Product Launch (Q4)' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;
}
