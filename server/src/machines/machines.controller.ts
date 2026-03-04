import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto, MachineIdDto } from './dto/update-machine.dto';
import { BindProjectDto, UnbindProjectDto, BoundProjectsDto } from './dto/bind-project.dto';
import { PageMachinesDto } from './dto/page-machines.dto';
import { Machine, MachineProject } from '../entities';

@ApiTags('机器管理')
@Controller('api/machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

  @Post('create')
  @ApiOperation({ summary: '注册工作机器' })
  @ApiResponse({ status: 201, description: '机器注册成功', type: Machine })
  create(@Body() createMachineDto: CreateMachineDto): Promise<Machine> {
    return this.machinesService.create(createMachineDto);
  }

  @Post('list')
  @ApiOperation({ summary: '获取机器列表' })
  @ApiResponse({ status: 200, description: '机器列表', type: [Machine] })
  findAll(): Promise<Machine[]> {
    return this.machinesService.findAll();
  }

  @Post('pageList')
  @ApiOperation({ summary: '分页获取机器列表' })
  @ApiResponse({ status: 200, description: '分页机器列表' })
  pageList(@Body() dto: PageMachinesDto) {
    return this.machinesService.pageList(dto);
  }

  @Post('detail')
  @ApiOperation({ summary: '获取机器详情' })
  @ApiResponse({ status: 200, description: '机器详情', type: Machine })
  @ApiResponse({ status: 404, description: '机器不存在' })
  findOne(@Body() dto: MachineIdDto): Promise<Machine> {
    return this.machinesService.findOne(dto.id);
  }

  @Post('update')
  @ApiOperation({ summary: '更新机器信息' })
  @ApiResponse({ status: 200, description: '机器更新成功', type: Machine })
  @ApiResponse({ status: 404, description: '机器不存在' })
  update(@Body() updateMachineDto: UpdateMachineDto): Promise<Machine> {
    const { id, ...rest } = updateMachineDto;
    return this.machinesService.update(id, rest);
  }

  @Post('remove')
  @ApiOperation({ summary: '删除机器' })
  @ApiResponse({ status: 200, description: '机器删除成功' })
  @ApiResponse({ status: 404, description: '机器不存在' })
  remove(@Body() dto: MachineIdDto): Promise<void> {
    return this.machinesService.remove(dto.id);
  }

  @Post('bindProject')
  @ApiOperation({ summary: '绑定工程到机器' })
  @ApiResponse({ status: 201, description: '绑定成功', type: MachineProject })
  bindProject(@Body() bindProjectDto: BindProjectDto): Promise<MachineProject> {
    const { machineId, ...rest } = bindProjectDto;
    return this.machinesService.bindProject(machineId, rest);
  }

  @Post('unbindProject')
  @ApiOperation({ summary: '解绑工程' })
  @ApiResponse({ status: 200, description: '解绑成功' })
  @ApiResponse({ status: 404, description: '绑定关系不存在' })
  unbindProject(@Body() dto: UnbindProjectDto): Promise<void> {
    return this.machinesService.unbindProject(dto.machineId, dto.projectId);
  }

  @Post('boundProjects')
  @ApiOperation({ summary: '获取机器绑定的工程列表' })
  @ApiResponse({ status: 200, description: '工程列表', type: [MachineProject] })
  getBoundProjects(@Body() dto: BoundProjectsDto): Promise<MachineProject[]> {
    return this.machinesService.getBoundProjects(dto.machineId);
  }
}
