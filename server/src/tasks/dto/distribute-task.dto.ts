import { IsString, IsNotEmpty, IsOptional, IsArray, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DistributeTaskDto {
  @ApiProperty({ description: '任务内容' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ description: '指定工程 ID 列表' })
  @IsArray()
  @IsOptional()
  projectIds?: number[];

  @ApiPropertyOptional({ description: '优先级 1-5', default: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  priority?: number = 3;
}
