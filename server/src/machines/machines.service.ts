import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as bcrypt from 'bcryptjs';
import { Machine, MachineProject, MachineStatus } from '../entities';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { BindProjectDto } from './dto/bind-project.dto';
import { PageMachinesDto } from './dto/page-machines.dto';

@Injectable()
export class MachinesService {
  constructor(
    @InjectRepository(Machine)
    private machineRepository: Repository<Machine>,
    @InjectRepository(MachineProject)
    private machineProjectRepository: Repository<MachineProject>,
  ) {}

  async create(createMachineDto: CreateMachineDto): Promise<Machine> {
    // 生成 API Key
    const apiKey = uuidv4();
    const hashedApiKey = await bcrypt.hash(apiKey, 10);

    const machine = this.machineRepository.create({
      ...createMachineDto,
      apiKey: hashedApiKey,
      status: MachineStatus.OFFLINE,
    });

    const savedMachine = await this.machineRepository.save(machine);

    // 返回原始 API Key（只返回一次）
    return {
      ...savedMachine,
      apiKey, // 返回未加密的 API Key
    } as Machine;
  }

  async findAll(): Promise<Machine[]> {
    return this.machineRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async pageList(dto: PageMachinesDto) {
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 10;

    const [list, total] = await this.machineRepository.findAndCount({
      order: { createdAt: 'DESC' },
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

  async findOne(id: number): Promise<Machine> {
    const machine = await this.machineRepository.findOne({ where: { id } });
    if (!machine) {
      throw new NotFoundException(`机器 #${id} 不存在`);
    }
    return machine;
  }

  async update(id: number, updateMachineDto: Omit<UpdateMachineDto, 'id'>): Promise<Machine> {
    const machine = await this.findOne(id);
    Object.assign(machine, updateMachineDto);
    return this.machineRepository.save(machine);
  }

  async remove(id: number): Promise<void> {
    const machine = await this.findOne(id);
    await this.machineRepository.remove(machine);
  }

  // 绑定工程到机器
  async bindProject(
    machineId: number,
    bindProjectDto: Omit<BindProjectDto, 'machineId'>,
  ): Promise<MachineProject> {
    const machine = await this.findOne(machineId);

    // 检查是否已绑定
    const existing = await this.machineProjectRepository.findOne({
      where: {
        machineId,
        projectId: bindProjectDto.projectId,
      },
    });

    if (existing) {
      // 更新已存在的绑定
      Object.assign(existing, bindProjectDto);
      return this.machineProjectRepository.save(existing);
    }

    const machineProject = this.machineProjectRepository.create({
      machineId,
      ...bindProjectDto,
    });

    return this.machineProjectRepository.save(machineProject);
  }

  // 解绑工程
  async unbindProject(machineId: number, projectId: number): Promise<void> {
    const machineProject = await this.machineProjectRepository.findOne({
      where: { machineId, projectId },
    });

    if (!machineProject) {
      throw new NotFoundException('绑定关系不存在');
    }

    await this.machineProjectRepository.remove(machineProject);
  }

  // 获取机器绑定的工程列表
  async getBoundProjects(machineId: number): Promise<MachineProject[]> {
    return this.machineProjectRepository.find({
      where: { machineId },
      relations: ['project'],
    });
  }

  // 根据平台获取可用机器
  async findAvailableMachines(platform?: string): Promise<Machine[]> {
    const query = this.machineRepository
      .createQueryBuilder('machine')
      .where('machine.status = :status', { status: MachineStatus.ONLINE });

    if (platform) {
      query.andWhere('machine.platform = :platform', { platform });
    }

    return query.getMany();
  }

  // 获取机器原始 API Key
  async getApiKey(id: number): Promise<string> {
    const machine = await this.machineRepository.findOne({ where: { id } });
    if (!machine) {
      throw new NotFoundException(`机器 #${id} 不存在`);
    }
    // 需要存储原始 key 以便返回，这里简化处理
    return machine.apiKey;
  }
}
