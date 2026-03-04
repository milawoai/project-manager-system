import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { existsSync } from 'fs';
import { join } from 'path';
import { Request, Response } from 'express';
import { AppModule } from './app.module';
import { getConfig } from './config';

async function bootstrap() {
  const config = getConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 启用验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 配置 Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('分布式任务分发系统 API')
    .setDescription('服务端 API 文档')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API Key 认证',
      },
      'X-API-Key',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // 托管 web 前端静态资源（存在时启用）
  const webDistPath = join(process.cwd(), '../web/dist');
  if (existsSync(webDistPath)) {
    app.useStaticAssets(webDistPath);

    const expressApp = app.getHttpAdapter().getInstance() as {
      get: (path: RegExp, handler: (req: Request, res: Response) => void) => void;
    };

    expressApp.get(/^(?!\/api|\/socket\\.io|\/ws).*/, (_req: Request, res: Response) => {
      res.sendFile(join(webDistPath, 'index.html'));
    });
  }

  // 启用 CORS
  app.enableCors();

  await app.listen(config.port, config.host);
  console.log(`Application is running on: http://${config.host}:${config.port}`);
  console.log(`Swagger docs: http://${config.host}:${config.port}/api/docs`);
}
bootstrap();
