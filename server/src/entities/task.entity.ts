import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Machine } from './machine.entity';

export enum TaskStatus {
  PENDING = 'pending',
  DISTRIBUTED = 'distributed',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn({ type: 'integer', unsigned: true, comment: '主键' })
  id: number;

  @Column({ length: 255, nullable: true })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'project_ids', type: 'simple-json', nullable: true })
  projectIds: number[];

  @Column({ name: 'task_items', type: 'simple-json', nullable: true })
  taskItems: Array<{
    projectId: number;
    machineId?: number;
  }>;

  @Column({ type: 'int', default: 3 })
  priority: number;

  @Column({
    type: 'varchar',
    length: 50,
    default: TaskStatus.PENDING,
  })
  status: TaskStatus;

  @Column({ name: 'assigned_machine_id', nullable: true, type: 'integer' })
  assignedMachineId: number;

  @ManyToOne(() => Machine, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_machine_id' })
  assignedMachine: Machine;

  @Column({ type: 'text', nullable: true })
  result: string;

  @Column({ type: 'text', nullable: true })
  logs: string;

  @Column({ name: 'is_captured', type: 'int', default: 0, comment: '客户端是否已捕捉 0=未捕捉 1=已捕捉' })
  isCaptured: number;

  @Column({ name: 'is_delete', type: 'int', default: 0, comment: '逻辑删除 0 未删除 >0 已删除' })
  isDelete: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
