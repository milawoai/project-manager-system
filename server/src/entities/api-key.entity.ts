import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum ApiKeyType {
  MACHINE = 'machine',
  ADMIN = 'admin',
}

@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn({ type: 'integer', unsigned: true, comment: '主键' })
  id: number;

  @Column({ length: 255 })
  key: string;

  @Column({ length: 255 })
  name: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: ApiKeyType.MACHINE,
  })
  type: ApiKeyType;

  @Column({ name: 'expires_at', nullable: true })
  expiresAt: Date;

  @Column({ name: 'is_delete', type: 'int', default: 0, comment: '逻辑删除 0 未删除 >0 已删除' })
  isDelete: number;

  @CreateDateColumn({ name: 'created_at', comment: '创建时间' })
  createdAt: Date;
}
