import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateTaskDto {
  @ApiPropertyOptional({ example: 'Design the move endpoint (v2)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    example: 'Updated notes',
    nullable: true,
    description: 'Pass null to clear the description',
  })
  // Allow explicit null to clear; otherwise must be a string.
  @ValidateIf((_, value) => value !== null)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
