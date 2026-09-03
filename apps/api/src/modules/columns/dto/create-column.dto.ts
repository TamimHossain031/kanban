import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateColumnDto {
  @ApiProperty({ example: 'In Progress' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;
}
