import { IsString, IsNotEmpty, IsOptional, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaskStatus } from '../../entities';

export class UpdateTaskStatusDto {
  @ApiProperty({ description: '任务 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  taskId: number;

  @ApiProperty({ description: '状态：pending/running/completed/failed', enum: TaskStatus })
  @IsEnum(TaskStatus)
  @IsNotEmpty()
  status: TaskStatus;

  @ApiPropertyOptional({ description: '执行结果' })
  @IsString()
  @IsOptional()
  result?: string;

  @ApiPropertyOptional({ description: '执行日志' })
  @IsString()
  @IsOptional()
  logs?: string;

  @ApiProperty({ description: '工作机器 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  machineId: number;
}

export class TaskIdDto {
  @ApiProperty({ description: '任务 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id: number;
}
