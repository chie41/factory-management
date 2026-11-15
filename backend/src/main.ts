
import 'dotenv/config';

import { json } from 'express';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import {
  AppModule,
} from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use('/api/v1/customer-ledger/excel-import', json({ limit: '8mb' }));
  app.use('/api/v1/customer-ledger/print', json({ limit: '8mb' }));
  // Nest detects parsers by middleware name, including the route-scoped parser above.
  // Register the default parser explicitly so other JSON endpoints still receive req.body.
  app.use(json());
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger UI cho môi trường development
  if (process.env['NODE_ENV'] === 'development') {
    const config = new DocumentBuilder()
      .setTitle('Factory Management API')
      .setDescription('API quản lý xưởng')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env['PORT'] ?? 3000);

  await app.listen(port);

  console.log(`Backend: http://localhost:${port}/api/v1`);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}

bootstrap().catch((error: unknown) => {
  console.error('Không thể khởi động Backend:', error);
  process.exitCode = 1;
});
