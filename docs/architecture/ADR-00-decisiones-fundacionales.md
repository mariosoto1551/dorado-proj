# ADR-00 — Decisiones Fundacionales de Plataforma

> Este documento resuelve, con decisión tomada, los ADRs que `proyecto-dorado-plan-desarrollo-general.md` marca como pendientes en Fase 0. Es la fuente de verdad para todo lo que las fases 1–13 dan por sentado. Si algo de acá cambia, hay que revisar todas las fases posteriores.
>
> Fuentes: `proyecto-dorado-arquitectura-base.md` (visión y modelo de dominio) y `proyecto-dorado-plan-desarrollo-general.md` (orden de fases).

## 1. Roles y jerarquía de acceso

```ts
enum Rol {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN', // gestiona organizaciones y planes a nivel plataforma. Fuera del alcance de UI hasta Fase 14 (post-MVP); el enum existe desde el día 1 para no romper el JWT después.
  ORG_ADMIN      = 'ORG_ADMIN',      // creado por auto-registro público. Es un Tutor con alcance a TODOS los Grupos de su Organización y acceso a Billing.
  TUTOR          = 'TUTOR',          // administra uno o varios Grupos específicos (asignados vía invitación o creados por un ORG_ADMIN).
  USUARIO        = 'USUARIO',        // participante. Pertenece exactamente a un Grupo.
}
```

`ORG_ADMIN` y `TUTOR` son la misma entidad de base de datos (`Tutor`, ver Fase 2), diferenciados por el campo `rol`. Un `ORG_ADMIN` tiene implícitamente acceso a todos los `Grupo` de su `Organizacion` sin necesidad de fila explícita en `TutorGrupo`; un `TUTOR` solo tiene acceso a los `Grupo` donde exista una fila en `TutorGrupo`.

> **Addendum (Fase 14, 2026-07-24) — revisión deliberada de "USUARIO pertenece exactamente a un Grupo".** A pedido de José, un `USUARIO` ahora puede pertenecer a **varios `Grupo` de su misma `Organizacion`** con la MISMA cuenta (antes, unirse a otro grupo obligaba a crear una cuenta nueva). La membresía pasa a modelarse en una tabla `UsuarioGrupo` (espejo de `TutorGrupo`); la columna `Usuario.grupoId` se conserva como "grupo de origen" y ya no es la única fuente de membresía. El `grupoIds` del JWT de un usuario puede tener N elementos. **El aislamiento multi-tenant NO cambia**: la reutilización de cuenta es solo dentro de la misma organización — no existe identidad de usuario que cruce organizaciones (lo garantiza, además del chequeo explícito, el filtro tenant-scoped sobre `Invitacion`). Detalle de ejecución y verificación E2E en `docs/progreso/fase-14-post-mvp.md`.

## 2. Multi-tenancy: partición por fila, no por schema

Decisión: **cada microservicio tiene su propia base de datos Postgres** (ya definido en la arquitectura base), y dentro de esa base **no hay un schema por tenant**. El aislamiento es a nivel de fila: toda tabla que contenga datos de negocio incluye las columnas `organizacionId` y, cuando aplica, `grupoId`, ambas indexadas.

Reglas obligatorias para todos los servicios:

- Ningún endpoint puede aceptar `organizacionId`/`grupoId` desde el body o query del cliente para decidir qué datos leer o escribir — siempre se toman del contexto de tenant inyectado a partir del JWT validado (ver sección 3).
- `libs/shared-auth` expone un `TenantContextGuard` (NestJS) que, después de validar el JWT, adjunta `req.tenant = { organizacionId, grupoIds, rol, principalId, principalType }` al request.
- `libs/shared-auth` expone también un `PrismaTenantMiddleware` reutilizable: intercepta las queries Prisma de modelos marcados como "tenant-scoped" y agrega automáticamente el filtro `where.organizacionId = tenant.organizacionId` (y `grupoId` cuando el modelo lo tiene) para evitar fugas por olvido humano. Cada servicio lo registra en su `PrismaService`.
- Ningún servicio hace join directo contra la base de otro servicio. Las relaciones inter-servicio son por ID (ver `libs/shared-types`) y se resuelven vía REST síncrono puntual o eventos.

## 3. Autenticación y JWT

Emisor único: Identity & Access Service (Fase 2). Algoritmo: RS256 (par de claves, la privada solo vive en Identity; la pública se distribuye a Gateway y a todos los servicios vía variable de entorno `JWT_PUBLIC_KEY` para que puedan validar sin llamar a Identity en cada request).

Payload del access token:

```ts
interface JwtPayload {
  sub: string;              // id del Tutor o del Usuario (según principalType)
  principalType: 'TUTOR' | 'USUARIO';
  organizacionId: string;
  grupoIds: string[];       // TUTOR: todos los grupos que administra (vacío si es ORG_ADMIN, que tiene acceso implícito a todos); USUARIO: exactamente 1 elemento
  rol: 'PLATFORM_ADMIN' | 'ORG_ADMIN' | 'TUTOR' | 'USUARIO';
  plan: 'FREE' | 'PRO';      // embebido al momento de login/refresh, consultado a Billing
  iat: number;
  exp: number;
}
```

- TTL access token: 2 horas.
- Refresh token: opaco (no JWT), 30 días, almacenado hasheado (`RefreshToken` en Identity, ver Fase 2), rotado en cada uso (el anterior queda `revocado = true`). Se entrega como cookie `httpOnly`, `secure`, `sameSite=lax`, nombre `dorado_refresh`.
- El access token se entrega en el body de la respuesta de login/refresh (no en cookie) porque el frontend lo guarda en memoria (no `localStorage`, no `sessionStorage`) y lo manda en `Authorization: Bearer <token>`.
- Ningún servicio que no sea Identity conoce la clave privada ni genera tokens.

## 4. Comunicación servicio-a-servicio síncrona

Cuando un servicio necesita datos de otro en el momento (no vía evento), se llama por REST interno, nunca expuesto públicamente (no pasa por Gateway). Convención:

- Variables de entorno `<SERVICIO>_INTERNAL_URL` (ej. `ACTIVITY_INTERNAL_URL`) apuntando al hostname interno del contenedor.
- Todo request interno lleva header `x-internal-secret: <GATEWAY_INTERNAL_SECRET>` (mismo valor compartido entre Gateway y todos los servicios vía env var). Cada servicio valida ese header en un guard separado del `TenantContextGuard` para rutas bajo `/internal/*`. Esto evita que alguien le pegue directo a un servicio saltándose el Gateway.
- El Gateway, al recibir un request ya autenticado, agrega headers `x-organizacion-id`, `x-grupo-ids`, `x-rol`, `x-principal-id`, `x-principal-type` antes de reenviar al servicio destino, además de reenviar el JWT original. Los servicios pueden confiar en esos headers **solo si** vienen acompañados del `x-internal-secret` correcto (así un servicio no tiene que re-validar el JWT si no quiere, aunque puede hacerlo).

## 5. RabbitMQ: topología

- Un único exchange tipo `topic`: `dorado.events`.
- Routing key por evento: `<servicio-productor>.<evento_snake_case>` (ej. `identity.usuario_unido`, `scoring.zona_alcanzada`).
- Cada servicio consumidor declara su propia cola con nombre `<servicio-consumidor>.q.<proposito>` (ej. `notification.q.eventos-dominio`, `audit.q.acciones-administrativas`, `scoring.q.registros-actividad`) y la bindea a `dorado.events` con los routing keys que le interesan (se puede usar wildcard `#` o `*` por servicio productor, ej. `session.#`).
- Dead-letter exchange `dorado.events.dlx` (topic también) + cola `<servicio>.dlq` por servicio consumidor: si un mensaje falla su procesamiento más de 3 veces (retry con backoff vía `x-death` header), va a la DLQ para revisión manual. No se descarta silenciosamente.
- Formato de mensaje: JSON, envelope estándar definido en `libs/shared-events`:

```ts
interface EventEnvelope<T> {
  eventId: string;        // uuid v4, para idempotencia en el consumidor
  eventType: string;       // ej. 'ActividadCompletada'
  producedBy: string;      // nombre del servicio productor
  organizacionId: string;
  grupoId?: string;
  occurredAt: string;      // ISO 8601
  correlationId: string;   // propagado desde el header x-correlation-id del request HTTP que lo originó (ver Fase 1, logging estructurado). Si lo dispara un job interno sin request asociado, se genera uno nuevo al inicio del job.
  payload: T;
}
```

- Los consumidores deben ser idempotentes: guardan `eventId` procesados (tabla `EventoProcesado(eventId, consumidor, procesadoEn)`) y descartan duplicados antes de aplicar efectos.

Catálogo completo de eventos: ver `docs/architecture/event-catalog.md`.

## 6. Convenciones generales de código y datos

- IDs: `uuid` v4 en todas las tablas (`@id @default(uuid())` en Prisma), nunca autoincremental — necesario porque los IDs cruzan límites de servicio y no debe haber colisión.
- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` en todo modelo mutable. Los modelos inmutables (ej. `EventoPuntos`, `RegistroAuditoria`) solo tienen `createdAt`.
- Puntos: siempre `Int` (nunca `Float`/`Decimal`) para evitar errores de redondeo. El signo se aplica al momento de escribir el ledger (positivo suma, negativo resta), no se infiere en tiempo de lectura.
- Nombres de tabla/columna en Prisma: `camelCase` en el schema (Prisma los mapea a `snake_case` en Postgres vía `@@map`/`@map` — cada servicio decide el mapeo, no es crítico para el MVP, se puede dejar el default de Prisma).
- DTOs compartidos: ver `docs/architecture/shared-types.md`.
- Todos los timestamps de negocio (deadlines, cron de sesión/sección) se calculan en la timezone del `Grupo` (`Grupo.timezone`, IANA string, ej. `America/La_Paz`), no en UTC del servidor — se convierte a UTC solo para persistencia y comparación interna.

## 7. Sobre de respuesta HTTP y manejo de errores (convención de API, todos los servicios)

Decisión tomada a partir de revisar cómo lo resuelve en producción otro ecosistema de microservicios (ver nota al pie): sin esto, cada servicio termina inventando su propio formato de error y el frontend tiene que manejar 9 formatos distintos.

- **Éxito**: los controllers NestJS devuelven el recurso/DTO directo (NestJS ya serializa a JSON) — no se envuelve en un `{ data: ... }` genérico, para no agregar ceremonia innecesaria. Las listas devuelven un array directo salvo que la paginación sea explícita (`docs/phases/fase-09-notification-audit.md`, `GET /notification/mis-notificaciones`), en cuyo caso el shape paginado se documenta puntualmente en esa fase.
- **Error**: un `HttpExceptionFilter` global (registrado en `main.ts` de cada servicio, vive en `libs/shared-auth` o una nueva `libs/shared-http`, se decide al implementar) traduce **toda** excepción no controlada a un sobre único:

```ts
interface ApiErrorResponse {
  statusCode: number;      // 400, 403, 404, 409, 500, etc.
  code: string;             // código estable para el frontend, ej. 'LIMITE_PLAN_ALCANZADO', 'NO_HAY_SESION_ABIERTA' (ya usados en varias fases)
  message: string;          // mensaje legible, en español, para mostrar o loguear
  correlationId: string;    // el mismo de ADR-00 sección 5, para cruzar con los logs
}
```

- Los `code` específicos ya aparecen mencionados sueltos en varios `fase-XX-*.md` (ej. `LIMITE_PLAN_ALCANZADO`, `OBLIGATORIA_NO_SE_COMPLETA`, `NO_HAY_SESION_ABIERTA`) — este filtro es el mecanismo que efectivamente los entrega en ese formato; no hace falta volver a definirlos, solo asegurarse de que cada `throw` use una excepción tipada (`class LimitePlanAlcanzadoException extends BadRequestException` o similar) que el filtro sepa mapear a su `code`.
- Un error sin `code` explícito (excepción no anticipada) cae a `code: 'ERROR_INTERNO'`, `statusCode: 500`, y **no** expone el mensaje real de la excepción al cliente (solo al log) — evita filtrar detalles internos.
- El frontend (`app-web`, `public-site`) siempre puede asumir este shape para cualquier respuesta no-2xx de cualquier servicio, sin casos especiales por servicio.

## 8. Validación de variables de entorno al arranque

Lección tomada de un problema real en otro proyecto: un nombre de variable de entorno mal escrito en un override de configuración pasó desapercibido durante meses porque el framework simplemente ignoraba el campo desconocido y seguía con el default — nadie notó que estaba mal hasta que se manifestó como un bug de negocio, no de configuración.

Regla para todos los servicios de este proyecto: **ningún servicio arranca con variables de entorno inválidas o faltantes silenciosamente**.

- Cada servicio define un schema de validación de sus variables de entorno (`class EnvSchema` con `class-validator`, o un schema de `zod`/`joi` — elegir uno y ser consistente en todo el monorepo, documentarlo en `fase-01-monorepo.md` al implementarlo) y lo valida en el arranque (`ConfigModule.forRoot({ validate })` de NestJS es el mecanismo estándar).
- Si falta una variable requerida o tiene un formato inválido (ej. `DATABASE_URL` que no parsea como URL, `JWT_PUBLIC_KEY` vacío), **el proceso no debe levantar** — falla rápido y con un mensaje claro, en vez de arrancar en un estado a medias que falla más tarde de forma confusa.
- Esto aplica en particular a los nombres de variables que varios servicios comparten (`GATEWAY_INTERNAL_SECRET`, `JWT_PUBLIC_KEY`, `RABBITMQ_URL`) — un typo en uno de los 9 servicios rompe la integración entre servicios de una forma difícil de diagnosticar si no hay validación temprana.

## 9. Pendientes explícitos (no bloquean Fases 0–12)

Estos temas están señalados como pendientes en los documentos fuente y **no se resuelven en este ADR** porque son decisiones de negocio, no técnicas, o no bloquean el desarrollo del MVP:

| Tema | Dónde impacta | Bloquea hasta |
|---|---|---|
| Proveedor de pagos real | Fase 4 (Billing) usa asignación manual/flag en el MVP; integración real es Fase 14 | Fase 14 |
| Privacidad/consentimiento de datos de menores | Aplica a `Usuario` en general (no solo Destino:Dorado) | Fase 14, antes de abrir a organizaciones públicas |
| Nombre de marca pública y dominio | Fase 11 (public-site) y branding general | No bloquea desarrollo, sí bloquea deploy final de marketing en Fase 13 |
| Seed data real de "Destino: Dorado" (catálogo de actividades/conductas, usernames de los 3 usuarios miembro) | Fase 13 (alta del tenant piloto) | Fase 13 exclusivamente — no bloquea 0–12, que usan seed data genérica de ejemplo |

## 10. Punto suelto detectado — requiere confirmación tuya

`memory.md` de una sesión anterior (contexto del caso "Destino: Dorado" previo al pivot a plataforma SaaS) menciona una regla de negocio que **no aparece en `proyecto-dorado-arquitectura-base.md`**: *"Task proposals from members enter a draft/approval workflow requiring admin acceptance or rejection"* — es decir, un `Usuario` podría proponer una Actividad nueva, que quedaría en estado borrador hasta que un Tutor la apruebe o rechace.

Como no está en la arquitectura base (que sí detalla con precisión quién puede crear/editar Actividades — solo el Tutor, sección 4.1), **este plan NO incluye ese flujo** en Fase 5 (Activity Catalog). Si seguís necesitando esa función, avisame y la agrego como sub-fase de Fase 5 con su propio modelo de datos (`PropuestaActividad`, estados `BORRADOR/APROBADA/RECHAZADA`) y evento `PropuestaActividadCreada`. Si no la mencionás, se asume descartada para este plan.
