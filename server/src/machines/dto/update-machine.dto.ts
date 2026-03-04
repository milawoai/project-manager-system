import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CreateMachineDto } from './create-machine.dto';

export class UpdateMachineDto extends PartialType(CreateMachineDto) {
  @ApiProperty({ description: '机器 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id: number;
}

export class MachineIdDto {
  @ApiProperty({ description: '机器 ID' })
  @Type(() => Number)
  @IsInt()
  @IsNotEmpty()
  id: number;
}
