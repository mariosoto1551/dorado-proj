---
name: nestjs-backend
description: Usar siempre que se escriba o edite código dentro de cualquiera de los servicios backend NestJS del monorepo (gateway, identity-service, billing-service, activity-service, session-service, scoring-service, rewards-service, notification-service, audit-service). Cubre estructura de módulos, versión y setup de NestJS 11, testing con Vitest, logging estructurado, y las convenciones de `ADR-00` aplicadas a código real.
---

# NestJS backend — Proyecto Dorado

## Versión y setup base

- **NestJS 11.x**. SWC es el transpilador por defecto en projects nuevos (`nx g @nx/nest:app` ya lo configura) — no volver a `ts-node`/`tsc` clásico, es ~20x más lento en watch mode.
- Express v5 es el adapter HTTP por defecto en Nest 11 — no fijar Express 4 a mano salvo que aparezca una incompatibilidad puntual con una librería (documentarlo si pasa).
- Considerar `NestFactory.createApplicationContext` / *Standalone Applications* (feature de Nest 11) para scripts puntuales (ej. seeds, jobs one-off) en vez de levantar todo el `AppModule` HTTP — más liviano.

## Estructura de carpetas: por feature, no por capa técnica

Cada servicio se organiza por dominio, no por tipo de archivo. Ejemplo dentro de `activity-service`:

```
src/
├── actividades/
│   ├── actividades.controller.ts
│   ├── actividades.service.ts
│   ├── actividades.module.ts
│   ├── dto/
│   └── actividades.controller.spec.ts
├── conductas/
│   └── ... (misma forma)
├── registro/          (Fase 7: endpoints de completar/no-hizo/registrar)
├── prisma/
│   └── prisma.service.ts
└── main.ts
```

Nada de carpetas globales `controllers/`, `services/`, `dtos/` con todo mezclado — eso escala mal pasados ~20 controllers (justo el tamaño que va a tener este monorepo con 9 servicios).

## Guards, middlewares e interceptors compartidos (`libs/shared-auth`)

Toda la lógica de `ADR-00` secciones 2–4 (TenantContextGuard, PrismaTenantMiddleware, decorators `@CurrentTenant()`/`@Roles()`, validación JWT) vive en `libs/shared-auth` y se importa, **no se reimplementa por servicio**. Antes de escribir un guard nuevo, revisar si ya existe ahí.

- Validación JWT: librería `jose` (no `jsonwebtoken`), RS256, clave pública vía `JWT_PUBLIC_KEY`.
- Rutas internas (`/internal/*`) van protegidas por un guard separado que valida `x-internal-secret`, nunca el mismo guard que valida JWT de usuario.

## Logging

- `nestjs-pino`, nunca `console.log`. Todo log estructurado con `correlationId` (ver `fase-01-monorepo.md`, sección de logging).
- Los servicios NestJS envuelven el logger de Pino como provider inyectable, no como singleton global suelto.

## Mensajería (RabbitMQ)

Usar `@golevelup/nestjs-rabbitmq`, no `@nestjs/microservices` (ver razón en `CLAUDE.md` raíz). Cada consumidor:

```ts
@RabbitSubscribe({
  exchange: 'dorado.events',
  routingKey: 'activity.actividad_completada',
  queue: 'scoring.q.registros-actividad',
  queueOptions: { deadLetterExchange: 'dorado.events.dlx', durable: true, arguments: { 'x-queue-type': 'quorum' } },
})
async handleActividadCompletada(envelope: EventEnvelope<ActividadCompletadaPayload>) {
  // 1. chequear EventoProcesado (idempotencia)
  // 2. aplicar efecto
  // 3. registrar en EventoProcesado
}
```

`x-queue-type: 'quorum'` es obligatorio en cada declaración de cola — RabbitMQ 4.3 recomienda colas cuórum sobre las clásicas espejadas para durabilidad real.

## Testing: dos niveles, no uno solo

Patrón tomado de un ecosistema de microservicios en producción (dos proyectos de test separados, unitario e integración, nunca mezclados) — acá se traduce a dos suites *dentro* del mismo proyecto Vitest, no dos proyectos Nx separados:

- **Unitarios** (`*.spec.ts`, rápidos, sin infraestructura real): mockean todo lo que cruza una frontera externa (Prisma, llamadas internas a otros servicios, el publisher de RabbitMQ — ver sección "Puertos vs. servicios internos" abajo). Cubren: guards de tenant (rechazo cuando falta `organizacionId`/rol insuficiente), reglas de negocio propias de la fase (ver checklist de "Criterios de aceptación" de cada `fase-XX-*.md`), mappers DTO↔Prisma.
- **Integración** (`*.integration-spec.ts`): contra infraestructura real, no mocks — Postgres real vía **`testcontainers`** (paquete npm, no el legacy `@testcontainers/postgresql` roto) y NestJS `Test.createTestingModule(...).compile()` levantando el módulo completo. Validan: migraciones de Prisma aplicando limpio, endpoints de punta a punta (incluidos 401/403 por JWT/rol), y el filtro de tenant funcionando de verdad contra la base (no contra un mock que asuma que funciona).
  - Si Docker no está disponible en el entorno (algunos runners de CI), la suite de integración se **saltea explícitamente** (`describe.skipIf(!dockerDisponible)`), nunca falla en rojo por eso — pero la suite unitaria sí corre siempre.
  - Un contenedor Postgres por archivo de test (no uno compartido entre archivos) para que corran en paralelo sin pisarse.
- E2E multiservicio (todo el stack junto, no un servicio aislado): Playwright, ver `fase-12-qa-hardening.md` — es un nivel más arriba que esto, no lo reemplaza.

## Puertos vs. servicios internos (qué se mockea, qué no)

Distinción útil para decidir qué necesita una interfaz inyectable (mockeable en unitarios) y qué no:

- **Cruza una frontera externa → sí se abstrae con una interfaz inyectable**: llamadas HTTP internas a otro servicio (ej. `IIdentityInternalClient` implementado por `IdentityInternalHttpClient`), el publisher de RabbitMQ (`IEventPublisher`), acceso a Prisma (ya lo da `PrismaService`). Estas son las que un test unitario mockea.
- **No cruza ninguna frontera (lógica en proceso) → NO hace falta una interfaz, es una clase/función normal**: parsear un body ya recibido, calcular una zona a partir de un puntaje, armar el mensaje de una notificación. Envolver esto en una interfaz "por si acaso" es ceremonia sin beneficio — NestJS ya inyecta la clase concreta y un test unitario la instancia directo, sin mock.
- Ejemplo concreto de este proyecto: en `scoring-service`, el cálculo de `puntajeTotal`/zona a partir de `EventoPuntos` es lógica en proceso (clase normal, test unitario directo); la llamada a `GET /internal/identity/grupos/:grupoId/usuarios` es una frontera externa (cliente inyectable, mockeado en unitarios, real en integración).

## Sobre de respuesta, errores y arranque

- Todo servicio registra el `HttpExceptionFilter` global de `ADR-00` sección 7 (sobre `ApiErrorResponse` consistente) — no inventar un formato de error por servicio.
- Todo servicio valida sus variables de entorno al arrancar (`ADR-00` sección 8) vía `ConfigModule.forRoot({ validate })` — si falta una o tiene formato inválido, el proceso no levanta. No dejar que un servicio arranque "a medias" con un valor por defecto silencioso.
- Interceptor de logging global (`LoggingInterceptor`, en `libs/shared-auth` o `shared-logging`) que loguea entrada/salida de cada request con `correlationId`, método, ruta y duración — así ningún handler individual necesita loguear "INICIO"/"FIN" a mano, es transversal.

## Errores comunes a evitar en este proyecto puntual

- Agregar un campo `puntajeActual` o similar "para no recalcular" — prohibido, ver `CLAUDE.md` regla 1.
- Hacer un `prisma.actividad.findMany()` sin pasar por el `PrismaTenantMiddleware` — cualquier query directa que se salte el filtro de tenant es un bug de seguridad, no un detalle de performance.
- Publicar un evento sin `correlationId` ni `eventId` — rompe idempotencia y trazabilidad (`ADR-00` sección 5).

## Dónde mirar antes de codear

`docs/architecture/ADR-00-decisiones-fundacionales.md` (completo), `docs/architecture/event-catalog.md`, y el archivo `docs/phases/fase-XX-*.md` correspondiente al servicio/fase que estás construyendo.
