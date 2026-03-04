import { IsString, IsNotEmpty, IsOptional, MaxLength, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ description: '工程名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Git 仓库地址' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  gitUrl?: string;

  @ApiPropertyOptional({ description: '工程描述' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: '平台类型 code（0=其他, 1=前端, 2=后端...）', default: 0 })
  @IsInt()
  @Min(0)
  @Max(16)
  @IsOptional()
  platform?: number;

  @ApiPropertyOptional({ description: '标签，逗号分隔，如 "vue,typescript"' })
  @IsString()
  @IsOptional()
  tags?: string;
}
