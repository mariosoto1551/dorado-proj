# Proyecto Dorado

Plataforma SaaS multi-tenant de sistemas de puntos gamificados (tutores/usuarios,
actividades, conductas, zonas, recompensas). "Destino: Dorado" es el tenant piloto
familiar, no el producto en sí.

> **Antes de tocar código**: leer `CLAUDE.md` (reglas no negociables y stack),
> `docs/architecture/ADR-00-decisiones-fundacionales.md` y el estado de fases en
> `docs/progreso/README.md`.

## Stack

Nx (monorepo) · NestJS 11 (9 servicios backend) · Angular 22 (`app-web`) ·
Astro 7 (`public-site`) · Prisma 7 + PostgreSQL 18 · RabbitMQ 4.3 ·
Vitest + Playwright · pnpm · Node 24 LTS.

## Estructura

```
apps/        gateway + 8 microservicios NestJS, app-web (Angular), public-site (Astro)
libs/        shared-types, shared-events, shared-auth, shared-logging, shared-ui
infra/       docker-compose.yml (Postgres + RabbitMQ + Adminer), k8s/
docs/        arquitectura (ADR, catálogo de eventos, DTOs), specs de fase, progreso
scripts/     utilitarios del repo
```

## Desarrollo local

```bash
pnpm install

# Infraestructura (Postgres con las 8 bases, RabbitMQ, Adminer en :8081)
docker compose -f infra/docker-compose.yml up -d

# Servir un proyecto puntual
pnpm nx serve gateway          # :3000 (los demás servicios: :3001-:3008)
pnpm nx serve app-web          # :4200
pnpm nx dev public-site        # :4321

# Tareas del monorepo
pnpm nx run-many -t build      # build de todo
pnpm nx run-many -t lint       # lint de todo
pnpm nx affected -t test       # tests de lo afectado por el cambio
```

Todo el tráfico de los frontends al backend pasa por el Gateway
(`localhost:3000/api/*`) — nunca directo a un servicio interno, ni en desarrollo.

## Orden de trabajo

El proyecto se construye fase por fase (`docs/phases/fase-00` a `fase-14`), sin
adelantarse ni reordenar. El registro real de lo ejecutado vive en
`docs/progreso/` — actualizarlo al cerrar cada fase.
