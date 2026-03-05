import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { TaskStatus } from '../../entities';

export class PageTasksDto {
  @ApiPropertyOptional({ description: '页码，从 1 开始', default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: '每页条数', default: 10, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 10;

  @ApiPropertyOptional({ description: '按分配机器 ID 过滤（桌面端传本机 machineId）' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  machineId?: number;

  @ApiPropertyOptional({ description: '任务名称模糊查询' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ description: '任务状态过滤', enum: TaskStatus })
  @IsString()
  @IsOptional()
  status?: TaskStatus;

  @ApiPropertyOptional({ description: '创建时间起始（ISO 字符串）' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ description: '创建时间截止（ISO 字符串）' })
  @IsString()
  @IsOptional()
  endDate?: string;
}
