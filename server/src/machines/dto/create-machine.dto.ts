import { IsString, IsNotEmpty, IsOptional, IsArray, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMachineDto {
  @ApiProperty({ description: '机器名称' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: '平台：windows/linux/macos' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  platform: string;

  @ApiPropertyOptional({ description: '是否安装了 OpenClaw' })
  @IsBoolean()
  @IsOptional()
  hasOpenClaw?: boolean;

  @ApiPropertyOptional({ description: '支持的工具列表' })
  @IsArray()
  @IsOptional()
  capabilities?: string[];
}

export class CreateMachineResponseDto {
  id: string;
  name: string;
  platform: string;
  hasOpenClaw: boolean;
  apiKey: string;
  capabilities: string[];
  status: string;
  createdAt: Date;
}
