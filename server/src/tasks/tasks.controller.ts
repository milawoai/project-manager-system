import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { DistributeTaskDto } from './dto/distribute-task.dto';
import { UpdateTaskStatusDto, TaskIdDto } from './dto/update-task-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PageTasksDto } from './dto/page-tasks.dto';
import { Task } from '../entities';

@ApiTags('任务管理')
@Controller('api/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post('distribute')
  @ApiOperation({ summary: '发放任务' })
  @ApiResponse({ status: 201, description: '任务发放成功' })
  @ApiResponse({ status: 400, description: '没有可用的工作机器' })
  distribute(@Body() distributeTaskDto: DistributeTaskDto) {
    return this.tasksService.distribute(distributeTaskDto);
  }

  @Post('create')
  @ApiOperation({ summary: '创建任务（用于网页端）' })
  @ApiResponse({ status: 201, description: '任务创建成功', type: Task })
  create(@Body() createTaskDto: CreateTaskDto): Promise<Task> {
    return this.tasksService.create(createTaskDto);
  }

  @Post('list')
  @ApiOperation({ summary: '获取任务列表' })
  @ApiResponse({ status: 200, description: '任务列表', type: [Task] })
  findAll(): Promise<Task[]> {
    return this.tasksService.findAll();
  }

  @Post('pageList')
  @ApiOperation({ summary: '分页获取任务列表' })
  @ApiResponse({ status: 200, description: '分页任务列表' })
  pageList(@Body() dto: PageTasksDto) {
    return this.tasksService.pageList(dto);
  }

  @Post('detail')
  @ApiOperation({ summary: '获取任务详情' })
  @ApiResponse({ status: 200, description: '任务详情', type: Task })
  @ApiResponse({ status: 404, description: '任务不存在' })
  findOne(@Body() dto: TaskIdDto): Promise<Task> {
    return this.tasksService.findOne(dto.id);
  }

  @Post('updateStatus')
  @ApiOperation({ summary: '更新任务状态' })
  @ApiResponse({ status: 200, description: '状态更新成功', type: Task })
  @ApiResponse({ status: 404, description: '任务不存在' })
  @ApiResponse({ status: 400, description: '机器 ID 不匹配' })
  updateStatus(@Body() updateTaskStatusDto: UpdateTaskStatusDto): Promise<Task> {
    const { taskId, ...rest } = updateTaskStatusDto;
    return this.tasksService.updateStatus(taskId, rest);
  }

  @Post('update')
  @ApiOperation({ summary: '编辑任务基本信息（标题、描述、优先级、分发项）' })
  @ApiResponse({ status: 200, description: '更新成功', type: Task })
  @ApiResponse({ status: 404, description: '任务不存在' })
  update(@Body() dto: UpdateTaskDto): Promise<Task> {
    return this.tasksService.update(dto);
  }

  @Post('redispatch')
  @ApiOperation({ summary: '重新下发任务到目标机器' })
  @ApiResponse({ status: 200, description: '下发结果' })
  @ApiResponse({ status: 404, description: '任务不存在' })
  @ApiResponse({ status: 400, description: '未配置分发项' })
  redispatch(@Body() dto: TaskIdDto) {
    return this.tasksService.redispatch(dto.id);
  }
}
