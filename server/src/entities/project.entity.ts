import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn({ type: 'integer', unsigned: true, comment: '主键' })
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'git_url', length: 500, default: '' })
  gitUrl: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  /** 平台类型，对应 PLATFORM_OPTIONS 的 code（0=其他, 1=前端, 2=后端...） */
  @Column({ type: 'int', nullable: true, default: 0 })
  platform: number;

  /** 标签，逗号分隔字符串存储，如 "vue,typescript,electron" */
  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ name: 'is_delete', type: 'int', default: 0, comment: '逻辑删除 0 未删除 >0 已删除' })
  isDelete: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: '更新时间' })
  updatedAt: Date;
}
