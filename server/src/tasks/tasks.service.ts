import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, Machine, MachineStatus, Project } from '../entities';
import { DistributeTaskDto } from './dto/distribute-task.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { CreateTaskDto } from './dto/create-task.dto';
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

    return this.taskRepository.save(task);
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

    const where = dto.machineId ? { assignedMachineId: Number(dto.machineId) } : {};

    const [list, total] = await this.taskRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      relations: ['assignedMachine'],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

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
}
