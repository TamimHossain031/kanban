import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateColumnDto {
  @ApiProperty({ example: 'Done' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;
}
