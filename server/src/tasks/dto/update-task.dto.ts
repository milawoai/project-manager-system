import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateTaskItemDto } from './create-task.dto';

export class UpdateTaskDto {
  @ApiProperty({ description: '任务 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id: number;

  @ApiPropertyOptional({ description: '任务名称' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '优先级 1-5' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  priority?: number;

  @ApiPropertyOptional({
    description: '任务分发项（更新后重新绑定机器）',
    type: [CreateTaskItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskItemDto)
  @IsOptional()
  list?: CreateTaskItemDto[];
}
