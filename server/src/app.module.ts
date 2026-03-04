import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getConfig } from './config';
import { Project, Machine, MachineProject, Task, ApiKey } from './entities';
import { ProjectsModule } from './projects/projects.module';
import { MachinesModule } from './machines/machines.module';
import { TasksModule } from './tasks/tasks.module';

const config = getConfig();

@Module({
  imports: [
    TypeOrmModule.forRoot({
      ...config.database,
      autoLoadEntities: true,
    }),
    TypeOrmModule.forFeature([Project, Machine, MachineProject, Task, ApiKey]),
    ProjectsModule,
    MachinesModule,
    TasksModule,
  ],
})
export class AppModule {}
