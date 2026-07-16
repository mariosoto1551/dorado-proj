import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { HttpExceptionFilter } from '@dorado/shared-auth';
import { correlationMiddleware } from '@dorado/shared-logging';

import { AppModule } from './app/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.flushLogs();

  // Registrado ANTES de listen(): corre primero que el middleware de pino-http
  // y deja el correlationId disponible para logs y el filtro de errores.
  app.use(correlationMiddleware);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  // Sin prefijo global: las rutas son /billing/* e /internal/* exactas a la
  // spec; el prefijo público /api lo agrega el Gateway (fase-03).
  const puerto = process.env.PORT ?? 3002;
  await app.listen(puerto);
}

bootstrap();
