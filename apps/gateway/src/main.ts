import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { correlationMiddleware } from '@dorado/shared-logging';

import { AppModule } from './app/app.module';
import {
  crearCabecerasSeguridadMiddleware,
  debeMandarHsts,
} from './proxy/cabeceras-seguridad.middleware';
import { crearVerificadorDeOrigen } from './proxy/cors-origin';
import { crearJwtValidationMiddleware } from './proxy/jwt-validation.middleware';
import { crearProxyMiddlewares } from './proxy/proxy.middleware';
import { crearRateLimitIaMiddleware } from './proxy/rate-limit-ia.middleware';
import { crearRateLimitMiddleware } from './proxy/rate-limit.middleware';
import { crearTenantHeaderInjector } from './proxy/tenant-header-injector.middleware';
import { resolverTrustProxy } from './proxy/trust-proxy';

/**
 * Gateway (fase-03): proxy puro + cross-cutting concerns. Sin base de datos
 * ni lógica de negocio. Orden de middlewares EXACTO al de la spec — los
 * registrados acá corren antes que cualquier middleware interno de Nest
 * (body-parser incluido), así los bodies llegan al proxy sin consumir.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.flushLogs();

  // 0. Cuántos proxies hay delante. Va ANTES de registrar nada: de esto
  //    depende qué IP ve el rate limiting del paso 4, y una vez que un
  //    middleware corrió con el valor viejo ya es tarde. Ver trust-proxy.ts:
  //    sin `TRUST_PROXY` no se confía en nadie (el Gateway está expuesto
  //    directo, como en el servidor de casa).
  const trustProxy = resolverTrustProxy(process.env.TRUST_PROXY);

  app.set('trust proxy', trustProxy);

  // 1. CORS — primero de todo: el preflight OPTIONS del navegador no debe
  //    atravesar el resto de la cadena. La política vive en cors-origin.ts
  //    (lista explícita + red local bajo CORS_ALLOW_LAN); acá solo se arma.
  //    ADMIN_WEB_URL es opcional: el panel de plataforma (fase-14-05) es una
  //    app aparte, en su propio origen, y sin esto sus llamadas al Gateway
  //    mueren en el preflight — que se ve como "el login no anda" y no como un
  //    problema de CORS. Sin definir, el panel simplemente no está desplegado.
  const listaOrigenes = [
    process.env.APP_WEB_URL,
    process.env.PUBLIC_SITE_URL,
    process.env.ADMIN_WEB_URL,
  ].filter((o): o is string => Boolean(o));

  app.enableCors({
    origin: crearVerificadorDeOrigen(listaOrigenes, process.env.CORS_ALLOW_LAN === 'true'),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // 2. Cabeceras de seguridad. Apenas después del preflight y antes que
  //    cualquier cosa que pueda responder por su cuenta, así los 429 del paso
  //    4 y los 401 del paso 5 también salen con ellas.
  app.use(
    crearCabecerasSeguridadMiddleware(
      debeMandarHsts(process.env.HSTS, trustProxy !== false)
    )
  );

  // 3. Correlation id — lee/genera x-correlation-id y lo propaga al proxy.
  app.use(correlationMiddleware);

  // 4. Rate limiting por IP (100/min global, 10/min login y registro).
  app.use(crearRateLimitMiddleware());

  // 5. Validación JWT RS256 (rutas exentas: lista explícita en el middleware).
  app.use(crearJwtValidationMiddleware());

  // 6. Límite por usuario sobre los endpoints del asistente que llaman a
  //    OpenAI (fase-14-29, Parte E 5c). Va acá y no junto al del paso 4
  //    porque su clave es el `sub` del token, que antes del paso 5 no existe.
  app.use(crearRateLimitIaMiddleware());

  // 7. Headers de contexto de tenant + x-internal-secret (ADR-00 §4).
  app.use(
    crearTenantHeaderInjector(() => process.env.GATEWAY_INTERNAL_SECRET as string)
  );

  // 8. Proxy por prefijo según la tabla de ruteo (503 si el servicio no está).
  for (const proxy of crearProxyMiddlewares(logger)) {
    app.use(proxy);
  }

  app.enableShutdownHooks();

  const puerto = process.env.PORT ?? 3000;
  await app.listen(puerto);
}

bootstrap();
