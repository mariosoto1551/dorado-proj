# Proyecto Dorado — memoria del proyecto para Claude Code

> Este archivo es lectura obligatoria antes de tocar código. Si algo acá contradice lo que ibas a hacer, esto gana. Los documentos completos están en `docs/architecture/` y `docs/phases/` — este archivo es un resumen de referencia rápida, no los reemplaza.

## Qué es esto

Plataforma SaaS multi-tenant de sistemas de puntos gamificados (tutores/usuarios, actividades, conductas, zonas, recompensas). "Destino: Dorado" es el tenant piloto familiar, no el producto en sí. Visión completa: `docs/architecture/ADR-00-decisiones-fundacionales.md` y los dos documentos fuente que cita ese ADR.

## Orden de trabajo

Se construye fase por fase, en orden, siguiendo `docs/phases/fase-00-especificacion.md` a `fase-14-post-mvp.md`. No te adelantes a una fase futura ni reordenes — cada archivo dice explícitamente sus prerrequisitos y qué queda fuera de alcance a propósito. Si estás ejecutando la Fase N, leé el archivo de esa fase completo antes de escribir una sola línea.

## Reglas no negociables (repetidas acá porque se violan fácil si no se las tiene presentes)

1. El puntaje **nunca** es un campo mutable. Siempre se deriva de un ledger de eventos (`EventoPuntos` en `scoring-service`), sumando en el momento de la lectura.
2. Ningún servicio hace join directo contra la base de datos de otro. Todo cruce es por ID, resuelto vía REST interno (`x-internal-secret`) o eventos.
3. Toda tabla de negocio lleva `organizacionId` (y `grupoId` cuando aplica), y ningún endpoint decide qué leer/escribir a partir de esos campos si vienen del cliente — siempre del JWT validado.
4. IDs siempre `uuid` v4, nunca autoincremental.
5. Puntos siempre `Int`, nunca `Float`/`Decimal`.
6. Una Sección cerrada no se edita silenciosamente — correcciones posteriores son filas nuevas explícitas (`corregidoDeId`), nunca `UPDATE`/`DELETE` de lo ya escrito.
7. Nada de `localStorage`/`sessionStorage` para tokens en `app-web` — el access token vive en memoria (signal), el refresh token en cookie `httpOnly`.

## Convenciones de estilo de código (todo TypeScript del monorepo — backend y frontend)

Adaptadas de un ruleset de estilo que José ya usa en otros proyectos (ahí estaba pensado para .NET; acá van las reglas que son agnósticas de lenguaje, llevadas a TypeScript — se descartó todo lo específico de Clean Architecture/CQRS/MediatR porque este proyecto no usa ese patrón, ver estructura por feature en el skill `nestjs-backend`):

1. Fila en blanco entre propiedades y métodos de una clase, y entre métodos consecutivos.
2. Métodos/funciones con máximo 7 parámetros de entrada — si hacen falta más, agrupar en un objeto de parámetros o un DTO, no seguir sumando argumentos sueltos. Reforzar con la regla ESLint `max-params` en la config raíz del monorepo (`eslint.config.js`).
3. Siempre usar llaves `{ }` en bloques de control aunque sea una sola instrucción (`if`, `for`, `else`) — nunca `if (x) return;` sin llaves. Reforzar con la regla ESLint `curly: ['error', 'all']`.
4. En clases abstractas (poco frecuentes en este proyecto — NestJS resuelve la mayoría de la reutilización vía DI, no herencia; si aparece alguna, ej. una excepción base compartida), las propiedades pensadas para que las subclases lean/escriban van `protected` o con getter/setter público, nunca `private` (que las bloquea).
5. Los DTOs de Request/Response de un mismo endpoint comparten prefijo con el nombre de la operación (ej. `CompletarActividadRequest`/`CompletarActividadResponse` para `POST /activity/actividades/:id/completar`). Este proyecto no usa el patrón Command/Query — ver `ADR-00`, no hay CQRS — pero la regla de prefijo compartido igual aplica a Request/Response.

Reglas 2 y 3 se codifican en ESLint (no quedan solo "en la memoria" de quien escribe el código) — configurarlas en Fase 1 junto con el resto del linting compartido.

## Stack y versiones (confirmadas julio 2026 — ver fuentes al pie)

Este proyecto usa **la última versión estable de cada tecnología al momento de instalar**, no versiones ancladas del pasado. La tabla de abajo es la referencia vigente a julio 2026; si al ejecutar una fase ya salió una versión mayor más nueva y estable, usar esa (evaluar breaking changes primero, no actualizar a ciegas en medio de una fase ya empezada).

| Tecnología | Versión de referencia (jul-2026) | Notas clave |
|---|---|---|
| Node.js | **24 LTS** (Active LTS hasta abr-2028) | No usar Node 26 todavía para producción — es Current, entra a LTS en oct-2026. |
| pnpm | **11.x** | Package manager único del monorepo. |
| Nx | **22.x** | Generadores `@nx/nest`, `@nx/angular`. Nx 22 ya trae "Nx agent skills" propios — no confundir con los skills de `.claude/skills/` de este repo, son cosas distintas. |
| Angular | **22** (signal-first) | Zoneless por defecto, `OnPush`/`Eager` como estrategia base, signal forms estables, componentes selectorless disponibles. Ver skill `angular-frontend`. |
| NestJS | **11.x** | SWC como transpilador por defecto (build ~20x más rápido que ts-node clásico), Express v5 default. Ver skill `nestjs-backend`. |
| Prisma ORM | **7.x** | Cliente Rust-free por defecto, adaptador de driver explícito (`@prisma/adapter-pg` para Postgres). Ver skill `prisma-orm`. |
| PostgreSQL | **18.x** | (v19 todavía en beta a esta fecha, no usar en Fase 1). |
| Tailwind CSS | **4.x** | Config CSS-first vía `@theme`, sin `tailwind.config.js`. Ver skill `tailwind-css`. |
| Astro | **7.x** | Compilador Rust, más estricto con HTML mal cerrado que antes — ver skill `astro-public-site` antes de escribir markup. |
| RabbitMQ | **4.3.x** | Colas cuórum (`quorum queues`) por defecto, no colas clásicas espejadas. Ver skill `rabbitmq-eventos`. |
| Testing | **Vitest** (unit/integración) + **Playwright** (e2e) | No usar Jest en proyectos nuevos de este repo. |
| JWT | librería **`jose`** | No `jsonwebtoken` — `jose` es ESM-first, usa Web Crypto API, soporta JWKS. RS256 según `ADR-00`. |
| Password hashing | **`argon2`** (argon2id) | `memoryCost: 65536, timeCost: 3, parallelism: 4` (defaults de la librería, ya cumplen el piso de OWASP). |
| Cliente RabbitMQ en NestJS | **`@golevelup/nestjs-rabbitmq`** | No usar `@nestjs/microservices` puro para esto — ese paquete está pensado para transporte RPC 1:1, no para el patrón fan-out por topic exchange que define `ADR-00` sección 5. `@golevelup/nestjs-rabbitmq` da decorators (`@RabbitSubscribe`) que calzan directo con la tabla de routing keys del catálogo de eventos. |

## Puertos locales (desarrollo, `docker-compose` + `nx serve`)

| Servicio | Puerto |
|---|---|
| Postgres | 5432 |
| RabbitMQ (AMQP / Management UI) | 5672 / 15672 |
| Adminer | 8081 |
| `gateway` | 3000 |
| `identity-service` | 3001 |
| `billing-service` | 3002 |
| `activity-service` | 3003 |
| `session-service` | 3004 |
| `scoring-service` | 3005 |
| `rewards-service` | 3006 |
| `notification-service` | 3007 |
| `audit-service` | 3008 |
| `ai-service` (asistente de IA, fase-14-29) | 3009 |
| `app-web` (`ng serve` / `nx serve`) | 4200 |
| `admin-web` (panel PLATFORM_ADMIN, `nx serve`) | 4300 |
| `public-site` (`astro dev`) | 4321 |

Todo el tráfico de los frontends hacia el backend pasa por el Gateway (`localhost:3000/api/*`) — nunca directo a un servicio interno, ni siquiera en desarrollo.

## Colores de zona (default de seed, Fase 0 — configurable por Grupo vía `UmbralZona.colorHex`)

| Zona | Color |
|---|---|
| Rojo | `#EF4444` |
| Amarillo | `#F59E0B` |
| Verde | `#22C55E` |
| Dorado | `#EAB308` |

El frontend nunca hardcodea estos valores fuera del seed — siempre los lee de la API (`GET /api/scoring/grupos/:grupoId/umbrales`). Ver `fase-10-frontend-completo.md`.

## Protocolo entre sesiones de Claude Code

Cada sesión de Claude Code arranca sin memoria de las anteriores — lo único persistente es el repo. Por eso:

- **Al empezar**: leer `docs/progreso/README.md` (tabla de estado por fase) y, si la última fase completada tiene notas, leer también su archivo `docs/progreso/fase-XX-*.md` completo antes de asumir que esa fase funciona. No confiar ciegamente en un estado `COMPLETADA` — correr la verificación que esa fase dejó anotada.
- **Al terminar una fase** (o un corte de trabajo significativo): completar `docs/progreso/fase-XX-*.md` correspondiente (estado, resumen, desviaciones del plan, checklist de aceptación marcada, deuda técnica, qué debería verificar la próxima sesión) y actualizar la tabla de `docs/progreso/README.md`. Un commit de git por fase, mensaje `fase-XX: <resumen>`.
- **Nunca editar retroactivamente** un `docs/phases/fase-XX-*.md` para que "coincida" con lo que terminó implementado — esos archivos son la especificación tal como se decidió; las desviaciones reales se documentan en `docs/progreso/`, no se pisan en la spec (mismo principio que la regla 6 de arriba, aplicado a la documentación).

## Dónde está cada cosa

- `docs/architecture/ADR-00-decisiones-fundacionales.md` — roles, multi-tenancy, JWT, RabbitMQ, convenciones. Leer primero.
- `docs/architecture/event-catalog.md` — todos los eventos de dominio, payloads, productor/consumidor.
- `docs/architecture/shared-types.md` — DTOs de `libs/shared-types`.
- `docs/phases/fase-XX-*.md` — un archivo por fase, con schema Prisma, endpoints, reglas de negocio y criterios de aceptación de esa fase específica. **No se edita una vez escrito** (ver protocolo de arriba).
- `docs/progreso/` — registro real de qué se ejecutó de cada fase, desviaciones y qué verificar antes de seguir. Leer/actualizar en cada sesión (ver protocolo arriba).
- `skills/` — una skill por pieza de stack (`nestjs-backend`, `angular-frontend`, `prisma-orm`, `tailwind-css`, `astro-public-site`, `nx-monorepo`, `rabbitmq-eventos`), formato `SKILL.md` estándar de Claude Code. **Mover esta carpeta a `.claude/skills/` en el repo real** (no se pudo escribir directo ahí desde la sesión de planificación que armó esto — ver nota al final de este archivo) para que Claude Code las cargue automáticamente.

## Si algo no está documentado

No inventes. Los documentos de este proyecto están escritos para no dejar nada implícito — si falta un dato (nombre de campo, endpoint, variable de entorno), es más probable que sea un hueco a señalar que algo para decidir sobre la marcha.

## Nota de setup (borrar esta sección una vez hecho)

La carpeta `skills/` de la raíz del repo tiene que moverse a `.claude/skills/` (un `mv skills .claude/skills` alcanza, creando `.claude/` si no existe). Se generó fuera de `.claude/` porque la sesión de planificación que armó estos documentos no tenía permiso de escritura directa en rutas `.claude/*`.

---

Fuentes de la tabla de versiones (consultadas julio 2026): [angular.dev/roadmap](https://angular.dev/roadmap), [Angular v21 Release](https://angular.dev/events/v21), [NestJS releases](https://github.com/nestjs/nest/releases), [Prisma ORM v7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Prisma changelog](https://www.prisma.io/changelog/2025-11-19), [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4), [Astro 7.0](https://astro.build/blog/astro-7/), [Node.js EOL dates](https://endoflife.date/nodejs), [Nx 22 release](https://nx.dev/blog/nx-22-release), [Nx changelog](https://nx.dev/changelog), [pnpm npm](https://www.npmjs.com/package/pnpm), [PostgreSQL release notes](https://www.postgresql.org/about/news/postgresql-184-1710-1614-1518-and-1423-released-3297/), [RabbitMQ 4.3 highlights](https://www.rabbitmq.com/blog/2026/04/23/rabbitmq-4.3-release), [jose npm](https://www.npmjs.com/package/jose), [argon2 npm](https://www.npmjs.com/package/argon2), [@golevelup/nestjs-rabbitmq npm](https://www.npmjs.com/package/@golevelup/nestjs-rabbitmq).
