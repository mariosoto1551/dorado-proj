import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';

import { correlationMiddleware } from '@dorado/shared-logging';

import { AppModule } from './app/app.module';
import { crearJwtValidationMiddleware } from './proxy/jwt-validation.middleware';
import { crearProxyMiddlewares } from './proxy/proxy.middleware';
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
  //    atravesar el resto de la cadena. Lista explícita de orígenes, nunca
  //    '*': con credentials (cookie dorado_refresh) el wildcard no funciona.
  //    Con CORS_ALLOW_LAN=true (modo casa) se REFLEJAN también los orígenes de
  //    red privada (192.168.x / 10.x / 172.16-31.x / localhost) para que la
  //    familia entre desde sus celus/laptops sin listar cada IP. Reflejar el
  //    origen puntual (no '*') mantiene funcionando la cookie de credentials.
  const listaOrigenes = [process.env.APP_WEB_URL, process.env.PUBLIC_SITE_URL].filter(
    (o): o is string => Boolean(o)
  );
  const permitirLan = process.env.CORS_ALLOW_LAN === 'true';
  const patronLan =
    /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // Sin Origin (curl, same-origin, healthchecks internos) → permitido.
      if (!origin || listaOrigenes.includes(origin) || (permitirLan && patronLan.test(origin))) {
        cb(null, true);

        return;
      }

      cb(null, false);
    },
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

  // 5. Headers de contexto de tenant + x-internal-secret (ADR-00 §4).
  app.use(
    crearTenantHeaderInjector(() => process.env.GATEWAY_INTERNAL_SECRET as string)
  );

  // 6. Proxy por prefijo según la tabla de ruteo (503 si el servicio no está).
  for (const proxy of crearProxyMiddlewares(logger)) {
    app.use(proxy);
  }

  app.enableShutdownHooks();

  const puerto = process.env.PORT ?? 3000;
  await app.listen(puerto);
}

bootstrap();
