import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { MachineProject } from './machine-project.entity';

export enum MachineStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  BUSY = 'busy',
}

@Entity('machines')
export class Machine {
  @PrimaryGeneratedColumn({ type: 'integer', unsigned: true, comment: '主键' })
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50 })
  platform: string;

  @Column({ name: 'has_open_claw', default: false })
  hasOpenClaw: boolean;

  @Column({ name: 'api_key', length: 255 })
  apiKey: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: MachineStatus.OFFLINE,
  })
  status: MachineStatus;

  @Column({ type: 'simple-json', nullable: true })
  capabilities: string[];

  @Column({ name: 'last_heartbeat', nullable: true })
  lastHeartbeat: Date;

  @Column({ name: 'is_delete', type: 'int', default: 0, comment: '逻辑删除 0 未删除 >0 已删除' })
  isDelete: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;

  @OneToMany(() => MachineProject, (mp) => mp.machine)
  machineProjects: MachineProject[];
}
