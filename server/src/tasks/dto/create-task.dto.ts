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

export class CreateTaskItemDto {
  @ApiProperty({ description: '工程 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  projectId: number;

  @ApiPropertyOptional({ description: '指定机器 ID（可选）' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  machineId?: number;
}

export class CreateTaskDto {
  @ApiProperty({ description: '任务名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '优先级 1-5', default: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  priority?: number = 3;

  @ApiProperty({
    description: '任务分发项，projectId 必填，machineId 可选',
    type: [CreateTaskItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTaskItemDto)
  list: CreateTaskItemDto[];
}
