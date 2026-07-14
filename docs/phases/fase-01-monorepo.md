# Fase 1 — Fundaciones del monorepo

> Objetivo: repo funcional, vacío de lógica de negocio, donde correr `docker compose up` levanta Postgres + RabbitMQ + Adminer y `nx run-many` no falla porque no hay nada que construir todavía. Basado en `proyecto-dorado-plan-desarrollo-general.md` sección 2.

## Prerrequisitos
Fase 0 completa: `docs/architecture/` y `docs/phases/` existen en el repo.

## Decisiones tomadas en esta fase

- **Herramienta de monorepo: Nx** (decisión confirmada con José — generadores oficiales `@nx/nest` y `@nx/angular`, grafo de dependencias para CI incremental).
- **Package manager: pnpm** (mejor manejo de workspaces/hoisting que npm, integra bien con Nx). Si no está instalado en el entorno de Claude Code, instalarlo primero (`npm i -g pnpm`) antes de `pnpm dlx create-nx-workspace`.
- **Node version**: LTS activa al momento de crear el repo, fijada en `.nvmrc` y en `engines` de `package.json` raíz — no se fija un número acá para no quedar desactualizado; Claude Code debe usar la LTS de Node vigente y documentarla en `.nvmrc`.
- **Cliente de administración de Postgres: Adminer** (imagen liviana, un solo contenedor, sin setup adicional) en vez de pgAdmin.

## Setup del workspace Nx

```
pnpm dlx create-nx-workspace@latest proyecto-dorado --preset=ts --pm=pnpm
cd proyecto-dorado
pnpm add -D @nx/nest @nx/angular @nx/node
```

Estructura de carpetas objetivo (idéntica a `proyecto-dorado-arquitectura-base.md` sección 8 — no improvisar nombres distintos):

```
proyecto-dorado/
├── apps/
│   ├── app-web/
│   ├── public-site/
│   ├── gateway/
│   ├── identity-service/
│   ├── billing-service/
│   ├── activity-service/
│   ├── session-service/
│   ├── scoring-service/
│   ├── rewards-service/
│   ├── notification-service/
│   └── audit-service/
├── libs/
│   ├── shared-types/
│   ├── shared-events/
│   ├── shared-auth/
│   └── shared-ui/
├── infra/
│   ├── docker/
│   ├── docker-compose.yml
│   ├── k8s/
│   └── env/
├── docs/                 (ya creado en Fase 0)
├── scripts/
├── .github/workflows/
├── nx.json
├── package.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

En esta fase **solo se crean los proyectos `apps/*` con `nx g @nx/nest:app` / `nx g @nx/angular:app` vacíos** (hello world / health check). La lógica de cada servicio se implementa en su propia fase. No adelantar código de negocio.

## Linting y formatting compartidos

Una sola config raíz para todo el monorepo (no una por servicio):

- `eslint.config.js` (flat config) en la raíz, extendido por cada `apps/*`/`libs/*` vía el plugin de Nx (`@nx/eslint-plugin`). Incluye, además del preset recomendado de TypeScript/Angular/Nest: `curly: ['error', 'all']` y `max-params: ['error', 7]` — ver `CLAUDE.md` raíz, sección "Convenciones de estilo de código", son las dos reglas de ese set que se pueden aplicar automáticamente en vez de depender de que se respeten a mano.
- Prettier (`.prettierrc`) compartido en la raíz — formateo automático, no debatir estilo caso por caso.
- `nx g @nx/eslint:lint-project` (o el generador equivalente vigente) para que cada proyecto nuevo quede enganchado a la config raíz automáticamente, no reinventada por servicio.

## Librerías compartidas (`libs/`)

- `libs/shared-types`: contenido = `docs/architecture/shared-types.md` convertido a `.ts` real (`nx g @nx/node:lib shared-types`). Un archivo `index.ts` por dominio (`auth.ts`, `identity.ts`, `billing.ts`, `activity.ts`, `session.ts`, `scoring.ts`, `rewards.ts`, `notification-audit.ts`), re-exportados desde `index.ts` raíz.
- `libs/shared-events`: contenido = `docs/architecture/event-catalog.md` convertido a `.ts` (interfaces de payload + `EventEnvelope<T>` + constantes de routing key, ej. `export const ROUTING_KEYS = { ACTIVIDAD_COMPLETADA: 'activity.actividad_completada', ... } as const`).
- `libs/shared-auth`: `nx g @nx/nest:lib shared-auth`. Contiene (implementación real recién en Fase 2, acá solo se scaffoldea el proyecto vacío):
  - `TenantContextGuard`
  - `PrismaTenantMiddleware`
  - decorators `@CurrentTenant()`, `@Roles(...)`
  - utilidades de verificación JWT (RS256, usa `JWT_PUBLIC_KEY`)
- `libs/shared-ui`: `nx g @nx/angular:lib shared-ui`. Design tokens (colores de zona Rojo/Amarillo/Verde/Dorado, tipografía, espaciados) como variables Tailwind/CSS custom properties, consumibles tanto por `app-web` (Angular) como por `public-site` (Astro) — para Astro se exportan también como archivo `.css` plano ya que Astro no consume libs Nx de Angular directamente.

## `infra/docker-compose.yml`

Servicios:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: dorado
      POSTGRES_PASSWORD: dorado_dev
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data", "./infra/docker/init-databases.sh:/docker-entrypoint-initdb.d/init-databases.sh"]

  rabbitmq:
    image: rabbitmq:3-management
    ports: ["5672:5672", "15672:15672"]  # 15672 = UI de management

  adminer:
    image: adminer
    ports: ["8081:8080"]
    depends_on: [postgres]

volumes:
  pgdata:
```

`infra/docker/init-databases.sh` crea, en el mismo contenedor de Postgres, una base por servicio (una instancia, un schema/DB por servicio, tal como pide el plan general):

```bash
#!/bin/bash
set -e
for db in identity_db billing_db activity_db session_db scoring_db rewards_db notification_db audit_db; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE $db;
EOSQL
done
```

Cada servicio, en su propia fase, define su `DATABASE_URL` apuntando a `postgresql://dorado:dorado_dev@localhost:5432/<su_db>`.

RabbitMQ: el exchange `dorado.events` y el DLX `dorado.events.dlx` se declaran desde código (cada servicio los declara de forma idempotente al arrancar, vía `amqp-connection-manager` o el cliente que se elija en Fase 2), no manualmente en la UI de management — así el setup es reproducible en cualquier entorno.

## CI base (`.github/workflows/ci.yml`)

- Trigger: `pull_request` y `push` a `main`.
- Usa `nx affected -t lint,test,build` comparando contra `origin/main` para no correr todo el monorepo en cada cambio.
- Cache de Nx (`nx-cache` action o `actions/cache` sobre `.nx/cache`).
- Un solo workflow por ahora (no un workflow por servicio) — separar por servicio es una optimización de Fase 12 si el tiempo de CI lo justifica.

## Logging estructurado con correlación

- Librería: `nestjs-pino` en todos los servicios NestJS (scaffoldear en `libs/shared-auth` o una nueva `libs/shared-logging` — decisión de implementación libre, documentar cuál se eligió en el README de la lib).
- Middleware que lee el header `x-correlation-id` entrante; si no viene (primer punto de entrada = Gateway), genera un `uuid v4` nuevo. Lo propaga en:
  - Toda llamada REST saliente a otro servicio (header `x-correlation-id`).
  - Todo evento publicado a RabbitMQ (campo `correlationId` del `EventEnvelope`, ver `docs/architecture/ADR-00-decisiones-fundacionales.md` sección 5).
  - Todo log estructurado (`pino` con campo `correlationId` en cada línea).
- Esto se implementa una sola vez en `libs/shared-auth` (o `shared-logging`) y se reutiliza en todos los servicios desde que se crean en sus fases respectivas — no reimplementar por servicio.

## Criterios de aceptación de esta fase

- [ ] `docker compose -f infra/docker-compose.yml up` levanta Postgres (con las 8 bases creadas), RabbitMQ y Adminer sin errores.
- [ ] `pnpm nx run-many -t build` compila todos los `apps/*` vacíos y `libs/*` sin errores.
- [ ] `libs/shared-types` y `libs/shared-events` contienen exactamente las interfaces de `docs/architecture/shared-types.md` y `event-catalog.md`, sin agregar ni quitar campos.
- [ ] CI corre en un PR de prueba y pasa en verde.
- [ ] Ningún servicio tiene todavía lógica de negocio ni conexión Prisma real (eso arranca en Fase 2).
- [ ] `pnpm nx run-many -t lint` pasa en verde en todos los proyectos, y un archivo con un `if` sin llaves o una función de 8 parámetros hace fallar el lint (probarlo a propósito una vez y revertirlo, para confirmar que las reglas realmente están activas).

## Nota para Claude Code

Esta fase es 100% infraestructura. Si te encontrás escribiendo un endpoint, un modelo Prisma con campos de negocio, o un consumer de RabbitMQ con lógica, parate — eso es de otra fase.
