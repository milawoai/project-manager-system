/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto, ProjectIdDto } from './dto/update-project.dto';
import { PageProjectsDto } from './dto/page-projects.dto';
import { Project } from '../entities';

@ApiTags('工程管理')
@Controller('api/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('create')
  @ApiOperation({ summary: '创建工程' })
  @ApiResponse({ status: 201, description: '工程创建成功', type: Project })
  create(@Body() createProjectDto: CreateProjectDto): Promise<Project> {
    return this.projectsService.create(createProjectDto);
  }

  @Post('list')
  @ApiOperation({ summary: '获取工程列表' })
  @ApiResponse({ status: 200, description: '工程列表', type: [Project] })
  findAll(): Promise<Project[]> {
    return this.projectsService.findAll();
  }

  @Post('pageList')
  @ApiOperation({ summary: '分页获取工程列表' })
  @ApiResponse({ status: 200, description: '分页工程列表' })
  pageList(@Body() dto: PageProjectsDto) {
    return this.projectsService.pageList(dto);
  }

  @Post('detail')
  @ApiOperation({ summary: '获取工程详情' })
  @ApiResponse({ status: 200, description: '工程详情', type: Project })
  @ApiResponse({ status: 404, description: '工程不存在' })
  findOne(@Body() dto: ProjectIdDto): Promise<Project> {
    return this.projectsService.findOne(dto.id);
  }

  @Post('update')
  @ApiOperation({ summary: '更新工程' })
  @ApiResponse({ status: 200, description: '工程更新成功', type: Project })
  @ApiResponse({ status: 404, description: '工程不存在' })
  update(@Body() updateProjectDto: UpdateProjectDto): Promise<Project> {
    const { id, ...rest } = updateProjectDto;
    return this.projectsService.update(id, rest);
  }

  @Post('remove')
  @ApiOperation({ summary: '删除工程' })
  @ApiResponse({ status: 200, description: '工程删除成功' })
  @ApiResponse({ status: 404, description: '工程不存在' })
  remove(@Body() dto: ProjectIdDto): Promise<void> {
    return this.projectsService.remove(dto.id);
  }
}
