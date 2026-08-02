# Proyecto Dorado

Plataforma SaaS multi-tenant de sistemas de puntos gamificados (tutores/usuarios,
actividades, conductas, zonas, recompensas). "Destino: Dorado" es el tenant piloto
familiar, no el producto en sí.

> **Antes de tocar código**: leer `CLAUDE.md` (reglas no negociables y stack),
> `docs/architecture/ADR-00-decisiones-fundacionales.md` y el estado de fases en
> `docs/progreso/README.md`.

## Stack

Nx (monorepo) · NestJS 11 (9 servicios backend) · Angular 22 (`app-web` +
`admin-web`) · Astro 7 (`public-site`) · Prisma 7 + PostgreSQL 18 · RabbitMQ 4.3 ·
Vitest + Playwright · pnpm · Node 24 LTS.

## Estructura

```
apps/        gateway + 8 microservicios NestJS, app-web + admin-web (Angular), public-site (Astro)
libs/        shared-types, shared-events, shared-auth, shared-logging, shared-ui
infra/       docker-compose.yml (Postgres + RabbitMQ + Adminer), k8s/
docs/        arquitectura (ADR, catálogo de eventos, DTOs), specs de fase, progreso
scripts/     utilitarios del repo
```

## Desarrollo local

### Requisitos

- Node 24 LTS · pnpm 11 · Docker (para Postgres + RabbitMQ).
- La primera vez: `pnpm install`.

### Arranque

Las piezas se levantan en terminales separadas: el backend (infra + los 9
servicios NestJS detrás del Gateway) y los frontends. Para el uso normal
alcanza con los pasos 1 y 2; los pasos 3 y 4 son opcionales.

```bash
# 1) Backend completo — infra (Postgres+RabbitMQ) + migraciones + los 9 servicios.
#    Deja todo arriba y esperando; Ctrl+C baja el stack y la infra.
pnpm dev:backend

# 2) App principal (Angular) — en OTRA terminal.
pnpm dev:app                     # http://localhost:4200

# 3) Sitio público (Astro) — en OTRA terminal, solo si lo necesitás.
pnpm dev:site                    # http://localhost:4321

# 4) Panel de plataforma (Angular) — OTRA terminal, solo si administrás la
#    plataforma (gestión de organizaciones/planes por un PLATFORM_ADMIN).
pnpm dev:admin                   # http://localhost:4300
```

El panel (`admin-web`) es opcional: solo lo usás como administrador de la
plataforma (no es parte de la app familiar). Comparte el mismo backend/Gateway.
Necesita una cuenta `PLATFORM_ADMIN`, que **no** se registra desde ninguna UI:
se crea al arrancar `identity-service` si definís estas variables de entorno
(`apps/identity-service/.env`), idempotente:

```bash
PLATFORM_ADMIN_EMAIL=vos@plataforma.dorado
PLATFORM_ADMIN_PASSWORD=una-clave-larga-y-secreta
# PLATFORM_ADMIN_NOMBRE=Administrador de plataforma   # opcional
```

Con eso, entrás al panel en `http://localhost:4300` con ese email y contraseña.

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
| `admin-web` (panel PLATFORM_ADMIN, Angular) | http://localhost:4300 |
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

Qué hace: libera puertos de corridas anteriores, levanta la infra (Postgres +
RabbitMQ), aplica migraciones, **compila** los 9 servicios y los arranca con
`CORS_ALLOW_LAN=true`, y sirve los frontends en `0.0.0.0` (accesibles desde la
red). **Dejá esa ventana abierta** mientras la usen; `Ctrl+C` baja todo.

> El backend corre **compilado** (`node dist/apps/<servicio>/main.js`), no con
> `nx serve`: no hay hot-reload, que para uso familiar no hace falta y evita el
> fallo de arranque descrito más abajo. Para desarrollar con watch seguí usando
> `pnpm dev:backend`.

Al final imprime **un QR y el nombre de red de la PC**:

```
  Que escaneen este QR con la cámara del celu:

     █▀▀▀▀▀█ ▄▀ ▄▄ █▀▀▀▀▀█
     █ ███ █ ▀█▄▀▄ █ ███ █          ← apunta a http://<IP>:4200
     █▄▄▄▄▄█ █ ▀ █ █▄▄▄▄▄█

  O que entren tipeando el nombre de esta PC:
     http://<nombre-de-tu-PC>.local:4200
```

El QR se regenera en cada arranque con la IP detectada, así que **siempre apunta
bien aunque el router haya cambiado la IP**. El nombre `.local` (mDNS/Bonjour, ya
viene en Windows 11, macOS, iOS y las distros modernas) es el atajo estable: no
cambia nunca. Lo que conviene es que cada uno lo abra una vez y use **"Agregar a
pantalla de inicio"** — les queda como un ícono en el celu y no vuelven a tipear
nada.

> **Android**: el soporte de `.local` es irregular según versión y navegador. Si
> en algún celu no abre por el nombre, que use el QR o la IP directa — por eso el
> QR lleva la IP y no el nombre.

Ninguna de las dos formas necesita reconstruir ni configurar nada: el frontend
deriva la URL del Gateway del host desde el que se abre (si entran a
`http://dorado.local:4200`, la app le pega a `http://dorado.local:3000/api`), y el
Gateway acepta por CORS tanto las IPs privadas como los nombres locales cuando
`CORS_ALLOW_LAN=true` (ver `apps/gateway/src/proxy/cors-origin.ts`). El registro
de la organización solo funciona desde `:4321`.

Para que el nombre funcione hicieron falta **dos** permisos distintos, no uno: el
CORS del Gateway (arriba) y el `allowedHosts` de Vite, que está abajo del dev
server de Angular y del de Astro y responde **403 "Blocked request"** a cualquier
`Host` que no reconozca (protección contra DNS rebinding). Las IPs literales las
acepta solo; los nombres hay que declararlos. `dev:casa` le pasa el nombre mDNS
detectado a los dos dev servers — a Angular por `--allowed-hosts`, a Astro por la
env `CASA_ALLOWED_HOSTS` que lee `astro.config.mjs`. Si además entrás por otro
nombre (por ejemplo un `dorado.casa` que resuelva el DNS de tu router), sumalo:

```bash
CASA_HOSTS=dorado.casa pnpm dev:casa
```

**Un nombre más lindo**: el nombre `.local` sale del nombre del equipo en Windows
(*Configuración → Sistema → Información → Cambiar el nombre de este equipo*). Si
lo renombrás a `dorado`, la dirección pasa a ser `http://dorado.local:4200`.
Requiere reiniciar.

**Que la IP no cambie nunca** (opcional, pero es lo que arregla el problema de
raíz): en el panel de tu router, buscá *DHCP reservation* / *IP estática por
MAC* / *Asignación manual* y reservá la IP actual de esta PC para su MAC. Si tu
router además permite entradas de DNS local, mapeá algo como `dorado.casa` a esa
IP y funciona en **todos** los dispositivos, sin depender de mDNS.

**Requisitos**: Docker corriendo + `pnpm install` hecho, y todos los equipos en el
**mismo WiFi** que esta PC.

#### Si algún servicio no arranca

`dev:casa` verifica el healthcheck de **los 9 servicios** antes de decir que está
listo, y si falta alguno aborta mostrando cuál:

```
     ✓ gateway                :3000
     ✗ identity-service       :3001
     ✓ billing-service        :3002
```

Hubo **dos** causas detrás del viejo síntoma de "algunos servicios no arrancaron":

1. **Nx abortaba el batch.** Los 9 `serve` son tareas `continuous`, y lanzarlas
   juntas con `nx run-many` hacía que Nx creyera ver un ciclo entre ellas
   (`Recursive task invocation detected`) y cortara el batch a mitad de camino —
   dejando algunos servicios arriba, otros no, y huérfanos sueltos. Por eso ahora
   el arranque no pasa por `nx serve`: Nx solo hace el `build` (tarea normal,
   cacheada) y cada servicio se lanza con `node dist/apps/<servicio>/main.js`.
2. **Procesos huérfanos de la corrida anterior** ocupando el puerto: si el padre
   muere primero, los hijos quedan huérfanos y el `taskkill /T` del árbol ya no
   los alcanza. En el arranque siguiente el servicio nuevo no puede bindear y
   muere.

`dev:casa` ahora libera esos puertos solo (mata únicamente procesos `node` en los
puertos del proyecto; si el puerto lo tiene otro programa, avisa y aborta en vez de
romper algo ajeno). Para inspeccionar o limpiar a mano:

```bash
pnpm casa:estado               # quién tiene cada puerto y si responde el health
pnpm casa:limpiar              # mata los huérfanos y sale, sin levantar nada
```

> **Ojo con el gateway zombie**: si el huérfano es el del `:3000`, responde el
> healthcheck igual — antes eso alcanzaba para que el script anunciara "LISTO" con
> los otros 8 caídos, y además seguías usando el **código viejo** del proceso
> zombie, así que recompilar no cambiaba nada. Por eso la limpieza va primero.

> **Windows — Firewall**: la primera vez, Windows pregunta si permitís que Node
> acceda a la red. Hay que elegir **"Permitir acceso"** en **redes privadas** para
> que los otros equipos puedan conectarse. Si ya lo bloqueaste sin querer, se
> arregla en *Firewall de Windows Defender → Permitir una aplicación*.

### Servir una pieza suelta

```bash
pnpm nx serve gateway          # o cualquier servicio individual
pnpm nx serve app-web          # :4200
pnpm nx serve admin-web        # :4300  (panel PLATFORM_ADMIN)
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
