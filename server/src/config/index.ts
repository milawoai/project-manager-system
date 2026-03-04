import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';

export interface AppConfig {
  port: number;
  host: string;
  wsPort: number;
  database: TypeOrmModuleOptions;
}

export const getConfig = (): AppConfig => {
  const dbType = process.env.DB_TYPE || 'sqlite';
  const dbDatabase = process.env.DB_DATABASE || './data/database.db';

  const baseConfig = {
    synchronize: true,
    logging: process.env.NODE_ENV !== 'production',
    entities: [join(__dirname, '**', '*.entity{.ts,.js}')],
  };

  let databaseConfig: TypeOrmModuleOptions;

  if (dbType === 'sqlite') {
    databaseConfig = {
      type: 'sqlite',
      database: dbDatabase,
      ...baseConfig,
    };
  } else {
    databaseConfig = {
      type: 'mysql',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || 'your_password',
      database: process.env.DB_DATABASE || 'project_distribute',
      ...baseConfig,
    };
  }

  return {
    port: parseInt(process.env.APP_PORT || '3000', 10),
    host: process.env.APP_HOST || '0.0.0.0',
    wsPort: parseInt(process.env.WS_PORT || '3001', 10),
    database: databaseConfig,
  };
};
