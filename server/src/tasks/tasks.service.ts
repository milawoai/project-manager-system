import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, Machine, MachineStatus, Project } from '../entities';
import { DistributeTaskDto } from './dto/distribute-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { PageTasksDto } from './dto/page-tasks.dto';
import { TasksGateway } from '../gateways/tasks.gateway';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(Machine)
    private machineRepository: Repository<Machine>,
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @Inject(forwardRef(() => TasksGateway))
    private tasksGateway: TasksGateway,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    const projectIds = Array.from(new Set(createTaskDto.list.map((item) => item.projectId)));
    const machineIds = Array.from(
      new Set(createTaskDto.list.map((item) => item.machineId).filter((id): id is number => Boolean(id))),
    );

    const projectCount = await this.projectRepository.count({
      where: { id: In(projectIds) },
    });

    if (projectCount !== projectIds.length) {
      throw new BadRequestException('存在无效的 projectId');
    }

    if (machineIds.length > 0) {
      const machineCount = await this.machineRepository.count({
        where: { id: In(machineIds) },
      });

      if (machineCount !== machineIds.length) {
        throw new BadRequestException('存在无效的 machineId');
      }
    }

    const assignedMachineId = createTaskDto.list[0]?.machineId;
    const description = createTaskDto.description?.trim() ?? '';
    const content = [createTaskDto.title, description].filter(Boolean).join('\n');

    const task = this.taskRepository.create({
      title: createTaskDto.title,
      description,
      content: content || createTaskDto.title,
      projectIds,
      taskItems: createTaskDto.list,
      priority: createTaskDto.priority ?? 3,
      status: TaskStatus.PENDING,
      assignedMachineId,
    });

    const savedTask = await this.taskRepository.save(task);

    // 创建后立即通过 WebSocket 下发到各 taskItem 指定的机器
    await this.dispatchTaskItems(savedTask, createTaskDto.list);

    return savedTask;
  }

  /**
   * 遍历 taskItems，对每个指定了 machineId 的条目通过 WebSocket 下发任务。
   * 下发成功后将任务状态更新为 DISTRIBUTED；若所有条目均未指定机器则状态保持 PENDING。
   */
  private async dispatchTaskItems(
    task: Task,
    items: Array<{ projectId: number; machineId?: number }>,
  ): Promise<void> {
    let dispatched = false;

    for (const item of items) {
      if (!item.machineId) continue;

      const project = await this.projectRepository.findOne({ where: { id: item.projectId } });

      const sent = await this.tasksGateway.sendTaskToMachine(item.machineId, {
        taskId: task.id,
        content: task.content,
        projectId: item.projectId,
        projectName: project?.name ?? null,
        gitUrl: project?.gitUrl ?? null,
      });

      if (sent) dispatched = true;
    }

    // sendTaskToMachine 内部已将状态置为 RUNNING（机器在线时）；
    // 若机器不在线（sent=false），则状态保持 PENDING，等待机器上线后手动下发。
    if (!dispatched && items.some((i) => i.machineId)) {
      console.warn(`[TasksService] 任务 #${task.id} 指定了机器但机器均不在线，状态保持 PENDING`);
    }
  }

  // 发放任务
  async distribute(distributeTaskDto: DistributeTaskDto) {
    const { content, projectIds, priority = 3 } = distributeTaskDto;

    // 1. 查找可用的机器
    let availableMachines: Machine[] = [];

    if (projectIds && projectIds.length > 0) {
      // 如果指定了工程，找到绑定这些工程的机器
      const machineProjects = await this.machineRepository
        .createQueryBuilder('machine')
        .innerJoin('machine.machineProjects', 'mp')
        .where('mp.projectId IN (:...projectIds)', { projectIds })
        .andWhere('machine.status = :status', { status: MachineStatus.ONLINE })
        .getMany();

      availableMachines = machineProjects;
    } else {
      // 未指定工程，获取所有在线机器
      availableMachines = await this.machineRepository.find({
        where: { status: MachineStatus.ONLINE },
      });
    }

    if (availableMachines.length === 0) {
      throw new BadRequestException('没有可用的工作机器');
    }

    // 2. 随机选择一个机器（负载均衡）
    const selectedMachine = availableMachines[Math.floor(Math.random() * availableMachines.length)];

    // 3. 创建任务
    const task = this.taskRepository.create({
      content,
      projectIds,
      priority,
      status: TaskStatus.PENDING,
      assignedMachineId: selectedMachine.id,
    });

    const savedTask: Task = await this.taskRepository.save(task);

    // 4. 获取工程信息
    let projectInfo: Project | null = null;
    if (projectIds && projectIds.length > 0) {
      projectInfo = await this.projectRepository.findOne({
        where: { id: projectIds[0] as number },
      });
    }

    // 5. 通过 WebSocket 下发任务
    const taskPayload = {
      taskId: savedTask.id,
      content: savedTask.content,
      projectId: projectIds?.[0] || null,
      projectName: projectInfo?.name || null,
      gitUrl: projectInfo?.gitUrl || null,
    };

    const sent = await this.tasksGateway.sendTaskToMachine(selectedMachine.id, taskPayload);

    if (sent) {
      // 更新任务状态为已分发
      savedTask.status = TaskStatus.DISTRIBUTED;
      await this.taskRepository.save(savedTask);
    }

    // 6. 返回结果
    return {
      taskId: savedTask.id,
      subTasks: projectIds?.map((projectId) => ({
        id: uuidv4(),
        content,
        projectId,
      })) || [{ id: uuidv4(), content, projectId: null }],
      assignedMachines: [
        {
          machineId: selectedMachine.id,
          machineName: selectedMachine.name,
          platform: selectedMachine.platform,
        },
      ],
    };
  }

  // 更新任务状态
  async updateStatus(taskId: number, updateDto: Omit<UpdateTaskStatusDto, 'taskId'>): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId },
      relations: ['assignedMachine'],
    });

    if (!task) {
      throw new NotFoundException(`任务 #${taskId} 不存在`);
    }

    // 验证机器 ID
    if (task.assignedMachineId !== updateDto.machineId) {
      throw new BadRequestException('机器 ID 不匹配');
    }

    task.status = updateDto.status;
    if (updateDto.result) task.result = updateDto.result;
    if (updateDto.logs) task.logs = updateDto.logs;

    return this.taskRepository.save(task);
  }

  // 获取任务列表
  async findAll(): Promise<Task[]> {
    return this.taskRepository.find({
      order: { createdAt: 'DESC' },
      relations: ['assignedMachine'],
    });
  }

  async pageList(dto: PageTasksDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 10;

    const qb = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.assignedMachine', 'assignedMachine')
      .orderBy('task.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (dto.machineId) {
      qb.andWhere('task.assignedMachineId = :machineId', { machineId: dto.machineId });
    }
    if (dto.title?.trim()) {
      qb.andWhere('task.title LIKE :title', { title: `%${dto.title.trim()}%` });
    }
    if (dto.status) {
      qb.andWhere('task.status = :status', { status: dto.status });
    }
    if (dto.startDate) {
      qb.andWhere('task.createdAt >= :startDate', { startDate: new Date(dto.startDate) });
    }
    if (dto.endDate) {
      // endDate 精确到天，取当天 23:59:59
      const end = new Date(dto.endDate);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('task.createdAt <= :endDate', { endDate: end });
    }

    const [list, total] = await qb.getManyAndCount();

    return {
      list,
      total,
      page,
      pageSize,
    };
  }

  // 获取任务详情
  async findOne(id: number): Promise<Task> {
    const task = await this.taskRepository.findOne({
      where: { id },
      relations: ['assignedMachine'],
    });

    if (!task) {
      throw new NotFoundException(`任务 #${id} 不存在`);
    }

    return task;
  }

  // 编辑任务基本信息
  async update(dto: UpdateTaskDto): Promise<Task> {
    const task = await this.taskRepository.findOne({ where: { id: dto.id } });
    if (!task) throw new NotFoundException(`任务 #${dto.id} 不存在`);

    if (dto.title !== undefined) {
      task.title = dto.title;
      const desc = dto.description ?? task.description ?? '';
      task.content = [dto.title, desc].filter(Boolean).join('\n');
    }
    if (dto.description !== undefined) {
      task.description = dto.description;
      task.content = [task.title, dto.description].filter(Boolean).join('\n');
    }
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.list !== undefined) {
      task.projectIds = Array.from(new Set(dto.list.map((i) => i.projectId)));
      task.taskItems = dto.list;
      task.assignedMachineId = dto.list[0]?.machineId ?? task.assignedMachineId;
    }

    return this.taskRepository.save(task);
  }

  // 重新下发已有任务到 taskItems 中指定的机器
  async redispatch(id: number): Promise<{ dispatched: boolean; message: string }> {
    const task = await this.taskRepository.findOne({ where: { id } });
    if (!task) throw new NotFoundException(`任务 #${id} 不存在`);

    if (!task.taskItems?.length) {
      throw new BadRequestException('任务未配置分发项，请先编辑任务并指定机器');
    }

    // 重置为 PENDING，便于重新触发下发流程
    task.status = TaskStatus.PENDING;
    await this.taskRepository.save(task);

    await this.dispatchTaskItems(task, task.taskItems);

    // 重新读取最新状态判断是否下发成功
    const updated = await this.taskRepository.findOne({ where: { id } });
    const dispatched = updated?.status === TaskStatus.RUNNING;

    return {
      dispatched,
      message: dispatched ? '任务已重新下发到目标机器' : '目标机器当前不在线，任务已重置为待处理',
    };
  }
}
