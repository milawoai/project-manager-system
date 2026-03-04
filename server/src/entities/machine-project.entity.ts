import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Machine } from './machine.entity';
import { Project } from './project.entity';

@Entity('machine_projects')
export class MachineProject {
  @PrimaryGeneratedColumn({ type: 'integer', unsigned: true, comment: '主键' })
  id: number;

  @Column({ name: 'machine_id' })
  machineId: number;

  @Column({ name: 'project_id' })
  projectId: number;

  @Column({ name: 'local_path', length: 500, nullable: true })
  localPath: string;

  @Column({ length: 100, nullable: true })
  branch: string;

  @Column({ name: 'is_delete', type: 'int', default: 0, comment: '逻辑删除 0 未删除 >0 已删除' })
  isDelete: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @ManyToOne(() => Machine, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'machine_id' })
  machine: Machine;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
