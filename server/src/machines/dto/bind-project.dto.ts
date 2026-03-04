import { IsNotEmpty, IsOptional, IsInt, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BindProjectDto {
  @ApiProperty({ description: '机器 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  machineId: number;

  @ApiProperty({ description: '工程 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  projectId: number;

  @ApiPropertyOptional({ description: '本地路径' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  localPath?: string;

  @ApiPropertyOptional({ description: '分支' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  branch?: string;
}

export class UnbindProjectDto {
  @ApiProperty({ description: '机器 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  machineId: number;

  @ApiProperty({ description: '工程 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  projectId: number;
}

export class BoundProjectsDto {
  @ApiProperty({ description: '机器 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  machineId: number;
}
