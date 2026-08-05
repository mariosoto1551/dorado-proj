import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { correlationMiddleware } from '@dorado/shared-logging';

import { AppModule } from './app/app.module';
import { crearVerificadorDeOrigen } from './proxy/cors-origin';
import { crearJwtValidationMiddleware } from './proxy/jwt-validation.middleware';
import { crearProxyMiddlewares } from './proxy/proxy.middleware';
import { crearRateLimitIaMiddleware } from './proxy/rate-limit-ia.middleware';
import { crearRateLimitMiddleware } from './proxy/rate-limit.middleware';
import { crearTenantHeaderInjector } from './proxy/tenant-header-injector.middleware';

/**
 * Gateway (fase-03): proxy puro + cross-cutting concerns. Sin base de datos
 * ni lógica de negocio. Orden de middlewares EXACTO al de la spec — los
 * registrados acá corren antes que cualquier middleware interno de Nest
 * (body-parser incluido), así los bodies llegan al proxy sin consumir.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.flushLogs();

  // 1. CORS — primero de todo: el preflight OPTIONS del navegador no debe
  //    atravesar el resto de la cadena. La política vive en cors-origin.ts
  //    (lista explícita + red local bajo CORS_ALLOW_LAN); acá solo se arma.
  const listaOrigenes = [process.env.APP_WEB_URL, process.env.PUBLIC_SITE_URL].filter(
    (o): o is string => Boolean(o)
  );

  app.enableCors({
    origin: crearVerificadorDeOrigen(listaOrigenes, process.env.CORS_ALLOW_LAN === 'true'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 2. Correlation id — lee/genera x-correlation-id y lo propaga al proxy.
  app.use(correlationMiddleware);

  // 3. Rate limiting por IP (100/min global, 10/min login y registro).
  app.use(crearRateLimitMiddleware());

  // 4. Validación JWT RS256 (rutas exentas: lista explícita en el middleware).
  app.use(crearJwtValidationMiddleware());

  // 5. Límite por usuario sobre los endpoints del asistente que llaman a
  //    OpenAI (fase-14-29, Parte E 5c). Va acá y no junto al del paso 3
  //    porque su clave es el `sub` del token, que antes del paso 4 no existe.
  app.use(crearRateLimitIaMiddleware());

  // 6. Headers de contexto de tenant + x-internal-secret (ADR-00 §4).
  app.use(
    crearTenantHeaderInjector(() => process.env.GATEWAY_INTERNAL_SECRET as string)
  );

  // 7. Proxy por prefijo según la tabla de ruteo (503 si el servicio no está).
  for (const proxy of crearProxyMiddlewares(logger)) {
    app.use(proxy);
  }

  app.enableShutdownHooks();

  const puerto = process.env.PORT ?? 3000;
  await app.listen(puerto);
}

bootstrap();
