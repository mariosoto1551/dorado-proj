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

### Requisitos

- Node 24 LTS · pnpm 11 · Docker (para Postgres + RabbitMQ).
- La primera vez: `pnpm install`.

### Arranque en 3 pasos

La app son **tres piezas** que se levantan en terminales separadas: el backend
(infra + los 9 servicios NestJS detrás del Gateway), y los dos frontends.

```bash
# 1) Backend completo — infra (Postgres+RabbitMQ) + migraciones + los 9 servicios.
#    Deja todo arriba y esperando; Ctrl+C baja el stack y la infra.
pnpm dev:backend

# 2) App principal (Angular) — en OTRA terminal.
pnpm dev:app                     # http://localhost:4200

# 3) Sitio público (Astro) — en OTRA terminal, solo si lo necesitás.
pnpm dev:site                    # http://localhost:4321
```

`pnpm dev:backend` usa `scripts/e2e-up.mjs --serve-only`: levanta la infra con
docker-compose, corre `prisma migrate deploy` en las 8 bases, arranca gateway +
8 servicios con `nx run-many` y espera a que todos pasen su healthcheck. El seed
de planes FREE/PRO (billing) se aplica solo en el bootstrap del servicio.

> **Tip**: si vas a reiniciar el backend seguido, dejá la infra levantada una vez
> con `pnpm dev:infra` y usá `pnpm dev:backend:noinfra` (no toca docker en cada
> arranque/parada, más rápido). Para bajar la infra al final: `pnpm dev:infra:down`.

### Puertos

| Pieza | URL |
|---|---|
| Gateway (única entrada al backend) | http://localhost:3000/api/* |
| Servicios internos | :3001–:3008 (no se acceden directo) |
| `app-web` (Angular) | http://localhost:4200 |
| `public-site` (Astro) | http://localhost:4321 |
| Adminer (DB) | http://localhost:8081 |
| RabbitMQ Management | http://localhost:15672 |

Todo el tráfico de los frontends al backend pasa por el Gateway
(`localhost:3000/api/*`) — nunca directo a un servicio interno, ni en desarrollo.
El `public-site` solo puede registrar organizaciones si se sirve en `:4321`, que
es el origen que el Gateway acepta por CORS.

### Modo casa (usarlo en la red de tu casa, desde cualquier celu/laptop)

Para que tu familia entre desde sus celulares/laptops en el **mismo WiFi** —
gratis, sin nube — un solo comando levanta TODO en tu PC:

```bash
pnpm dev:casa                    # = node scripts/home-up.mjs
```

Qué hace: levanta la infra (Postgres + RabbitMQ), aplica migraciones, arranca los
9 servicios backend con `CORS_ALLOW_LAN=true` y sirve los frontends en `0.0.0.0`
(accesibles desde la red). Al final imprime la dirección para pasarle a tu familia,
detectando la IP de tu WiFi automáticamente (descarta adaptadores virtuales de
WSL/Docker/VirtualBox). **Dejá esa ventana abierta** mientras la usen; `Ctrl+C`
baja todo.

```
  Tu familia entra desde el navegador de su celu/laptop a:
     http://<IP-de-tu-PC>:4200        (la app)

  Vos, para registrar la organización la primera vez:
     http://<IP-de-tu-PC>:4321/registro (el sitio de registro)
```

No hace falta reconstruir ni configurar la IP: el frontend deriva la URL del
Gateway del host desde el que se abre (si entran a `http://192.168.1.50:4200`, la
app le pega a `http://192.168.1.50:3000/api`). El registro de la organización solo
funciona desde `:4321` (origen que el Gateway acepta por CORS).

**Requisitos**: Docker corriendo + `pnpm install` hecho, y todos los equipos en el
**mismo WiFi** que esta PC.

> **Windows — Firewall**: la primera vez, Windows pregunta si permitís que Node
> acceda a la red. Hay que elegir **"Permitir acceso"** en **redes privadas** para
> que los otros equipos puedan conectarse. Si ya lo bloqueaste sin querer, se
> arregla en *Firewall de Windows Defender → Permitir una aplicación*.

### Servir una pieza suelta

```bash
pnpm nx serve gateway          # o cualquier servicio individual
pnpm nx serve app-web          # :4200
pnpm nx serve public-site      # :4321  (equivale a `astro dev`)
```

### Tareas del monorepo

```bash
pnpm build                     # build de todo (nx run-many -t build)
pnpm lint                      # lint de todo
pnpm test                      # tests unitarios de todo
pnpm e2e                       # suite E2E completa (levanta stack, corre Playwright, baja todo)
pnpm nx affected -t test       # solo lo afectado por el cambio actual
```

## Orden de trabajo

El proyecto se construye fase por fase (`docs/phases/fase-00` a `fase-14`), sin
adelantarse ni reordenar. El registro real de lo ejecutado vive en
`docs/progreso/` — actualizarlo al cerrar cada fase.
