import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task, Machine, Project, MachineProject } from '../entities';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksGateway } from '../gateways/tasks.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, Machine, Project, MachineProject]),
  ],
  controllers: [TasksController],
  providers: [TasksService, TasksGateway],
  exports: [TasksService],
})
export class TasksModule {}
