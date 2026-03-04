import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiProperty({ description: '工程 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id: number;
}

export class ProjectIdDto {
  @ApiProperty({ description: '工程 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id: number;
}
