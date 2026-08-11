# Registro de ejecución — Fase 13: Piloto y despliegue inicial

- **Estado**: COMPLETADA_CON_DESVIACIONES — **ESTABLE**. El deploy real y el alta del tenant quedan como **operación pendiente** (datos + cuentas de José), no como código faltante — no bloquean seguir construyendo.
- **Fecha de actualización**: 2026-07-26

## Declaración de estabilidad (José, 2026-07-26)

José **ratificó explícitamente que la Fase 13 está estable** (ya la había dado por
estable el 2026-07-24; el 2026-07-26 lo confirmó de nuevo al pedir el ítem 10 de
Fase 14). Consecuencia formal: la condición *"no ejecutar Fase 14 hasta que Fase 13
esté estable con uso real"* de `docs/phases/fase-14-post-mvp.md` queda **cumplida**
para todos los ítems de Fase 14 — no hace falta re-preguntarla en cada ítem nuevo.

Lo que sigue abierto es **operación**, no estabilidad del código: cargar los datos
reales del tenant y correr el deploy con las cuentas de José (o seguir en "modo
casa"/LAN, que es lo que se está usando). Nada de eso bloquea construir encima.
- **Commit/rama**: `master` — commit `fase-13: infra deploy-ready (docker/render/vercel/ci/runbook)`

## Alcance de esta sesión (decidido con José)

José eligió **"dejar todo deploy-ready"**: generar la infra-as-code y el runbook
para que él ejecute el deploy con sus cuentas (no puedo crear/usar cuentas de
Render/Vercel/CloudAMQP ni correr OAuth desde este entorno). Plataformas
(José delegó la decisión): **Render** (9 backend + Postgres), **Vercel**
(2 frontends), **CloudAMQP** (RabbitMQ).

## Lo implementado (deploy-ready)

- **`infra/docker/Dockerfile.service`** — Dockerfile único parametrizado por
  `--build-arg SERVICE`. Multi-stage: build Nx (webpack, con `generatePackageJson`)
  → runtime instala solo prod desde ese package.json (+ `pg` y CLI de Prisma en
  los servicios con base). `entrypoint.sh` corre `prisma migrate deploy`
  (idempotente) antes de arrancar. Usuario no-root. `.dockerignore` excluye
  node_modules/dist/**.env** (nunca hornear secretos).
- **`infra/docker/docker-compose.stack.yml`** — stack completo containerizado
  (9 servicios + infra) desde el Dockerfile. Doble uso: correr el sistema como
  se despliega, y ser el stack de la suite E2E en CI.
- **`infra/render.yaml`** — Blueprint de Render: 9 web services (Docker, `SERVICE`
  como build-arg) + 1 Postgres. Healthchecks, plan `starter` (session-service
  con scheduler cron no puede dormir), env `sync:false` para secretos/derivados.
- **`apps/app-web/vercel.json`** + **`apps/public-site/vercel.json`** — configs de
  Vercel (build Nx, outputDirectory correcto, SPA rewrite en app-web).
- **`apps/app-web/src/environments/environment.prod.ts`** + `fileReplacements` en
  `project.json` — cierra el hueco de Fase 03 (apiBaseUrl de prod). El build de
  producción lo toma bien (verificado).
- **`.env.production.example`** — nombres de env de prod por servicio (sin
  valores), marcando secretos.
- **`docs/runbook-deploy.md`** — paso a paso: claves JWT → CloudAMQP → Postgres
  (8 bases) → Blueprint de Render → Vercel → CORS → verificación → alta del
  tenant (con los datos confirmados) → observación post-alta.
- **`.github/workflows/ci.yml`** — job `e2e` que corre la suite de Fase 12 contra
  el stack completo (`node scripts/e2e-up.mjs`). **Cierra la deuda "E2E en CI"**
  diferida de Fase 12.

### Pivote de plataforma (por costo) → VPS único

Al llegar al alta de cuentas, se le mostró a José el costo real de Render (9
servicios always-on ≈ US$60/mes, porque son consumidores de eventos y no pueden
dormir en el free tier). **José eligió la opción VPS** (~US$6–12/mes, todo en una
máquina). Render/Vercel/CloudAMQP quedan como alternativa gestionada documentada.
Artefactos de la opción VPS:
- **`infra/docker/docker-compose.prod.yml`** — stack de producción: 9 servicios +
  Postgres + RabbitMQ + **Caddy (HTTPS automático)** en un VPS, con volúmenes
  persistentes, `restart: unless-stopped` y secretos por `.env.prod`. Con esta
  opción **no hace falta CloudAMQP** (RabbitMQ corre en el compose). Sintaxis
  validada (`docker compose config`).
- **`infra/docker/Caddyfile`** — reverse proxy HTTPS delante del gateway.
- **`infra/docker/.env.prod.example`** — secretos de prod (sin valores).
- **`infra/docker/.env.stack.example`** — claves de dev para el stack de CI/local.
- **`docs/runbook-deploy-vps.md`** — paso a paso del VPS (provisión → docker →
  clonar → env → up → DNS/TLS → Vercel para frontends → alta del tenant → operación).
- `.gitignore` endurecido: ignora `.env.*` reales, conserva los `*.example`.
- Frontends: siguen en **Vercel** (estáticos, gratis).

### "Modo casa" (LAN, gratis) — plan de prueba elegido por José

Por presupuesto ($ muy acotado), José eligió **arrancar corriendo todo en su PC**
y que la familia acceda desde sus celulares/laptops por el **WiFi de casa**
(gratis, sin nube ni dominio). Se agregó:
- **`apps/app-web/src/environments/environment.ts`**: `apiBaseUrl` ahora se
  DERIVA de `window.location` (host desde el que se abre la app) — el mismo build
  sirve para localhost y para cualquier IP de la red local, sin reconstruir.
  Producción sigue usando `environment.prod.ts` (URL fija) vía `fileReplacements`.
- **`apps/public-site/src/scripts/registro.ts`**: mismo fallback a `window.location`
  para el registro desde cualquier equipo de la red.
- **`apps/gateway/src/main.ts`**: CORS acepta orígenes de red privada
  (192.168/10/172.16-31/localhost) cuando `CORS_ALLOW_LAN=true` — REFLEJA el
  origen puntual (no `*`), así la cookie de credentials sigue funcionando. Fuera
  del modo casa, sigue la allowlist estricta (sin cambios en prod).
- **`scripts/home-up.mjs`**: un comando levanta infra + migraciones + los 9
  servicios (con `CORS_ALLOW_LAN`) + los 2 frontends en `0.0.0.0`, e imprime la
  dirección `http://<IP-de-la-PC>:4200` para la familia. Ctrl+C baja todo.
- Cookie de refresh con `REFRESH_COOKIE_SECURE=false` en LAN (http). Gateway
  build verificado tras el cambio de CORS.

### Servidor de casa containerizado (2026-08-07)

`scripts/home-up.mjs` resuelve el "modo casa" desde el código y muere al cerrar
la terminal. Para dejarlo corriendo 24/7 en una máquina de la red (que es lo que
José pidió) se agregó una tercera variante de despliegue, sin tocar las dos que
ya existían (VPS y Render):

- **`infra/docker/docker-compose.casa.yml`**: el sistema completo en
  contenedores — los 10 procesos backend (**incluido `ai-service`**, que no está
  en `stack.yml`/`prod.yml`), los 3 frontends, Postgres y RabbitMQ. Con
  `restart: unless-stopped` (arranca con la máquina, sin systemd), volúmenes
  persistentes, y Postgres/RabbitMQ sin publicar puertos.
- **`infra/docker/Dockerfile.web`** + `Caddyfile.spa` / `Caddyfile.estatico`:
  imagen parametrizada por `--build-arg APP` que compila un frontend y lo sirve
  con Caddy. Las SPAs de Angular llevan fallback a `index.html`; public-site no
  (Astro emite un `.html` por ruta y un 404 tiene que ser un 404).
- **Configuración de build `casa`** en `apps/app-web/project.json` y
  `apps/admin-web/project.json`: la de producción **sin** el `fileReplacements`
  de `environment.prod.ts`. Es la pieza que hace que el mismo build sirva para
  cualquier dirección del servidor — sobrevive el `environment.ts` que deriva la
  URL del Gateway de `window.location`. Con la config de producción habría que
  hornear una IP y rehacer la imagen cada vez que el router renueva el DHCP.
- **Cero configuración de dirección**: `CORS_ALLOW_LAN=true` en el Gateway ya
  refleja IPs privadas, `*.local`/`*.lan` y nombres de una etiqueta, así que
  `APP_WEB_URL`/`PUBLIC_SITE_URL` quedan en sus defaults de localhost y no hay
  ninguna IP anotada en ningún archivo.
- **`infra/docker/.env.casa.example`** (5 secretos, `OPENAI_API_KEY` opcional) y
  **`docs/runbook-deploy-casa.md`** (runbook completo, con notas por distro para
  Ubuntu/Mint/Alpine/Raspberry).

Sigue pendiente y **fuera del alcance de este corte**: `ai-service` tampoco está
en `docker-compose.stack.yml`, `docker-compose.prod.yml`, `docker-compose.images.yml`
ni en el matrix de `.github/workflows/images.yml`. El despliegue a internet
sigue sin asistente de IA.

## Verificación hecha en esta sesión

- **app-web build de producción**: `nx build app-web --configuration=production`
  en verde; `fileReplacements` reemplaza el entorno (el bundle prod NO contiene
  `localhost:3000`, sí el placeholder de gateway prod). `outputDirectory` del
  vercel.json (`dist/apps/app-web/browser`) confirmado con `index.html`.
- **Imagen Docker** (scoring-service): **construida y CORRIDA de verdad** contra
  la infra (postgres + rabbitmq): el contenedor migra (`prisma migrate deploy`
  → "No pending migrations to apply"), arranca Nest, **conecta a RabbitMQ** y
  registra los consumers (`scoring.q.registros-actividad`, `scoring.q.sesiones`),
  y responde `/internal/health` → `{"status":"ok"}`. Para llegar ahí se
  resolvieron seis cosas reales del empaquetado (ver más abajo). El build local
  fue lento por la red del equipo (~32 KiB/s) pero completó con el cache mount
  del store de pnpm; en CI/Render (red rápida) es directo.

## Bloqueantes reales para completar la fase (dependen de José)

- **Datos confirmados** (spec/`ADR-00` §9): catálogo real de Actividades/Conductas,
  `username` de los 3 hijos, recompensas por zona. **No inventar** (nota de la spec).
  - [ ] Catálogo real de Actividades/Conductas.
  - [ ] `username` de los 3 Usuarios.
  - [ ] Recompensas reales por zona.
- **Cuentas/credenciales** de Render, Vercel y CloudAMQP — el deploy real lo
  ejecuta José siguiendo `docs/runbook-deploy.md`.

## Deuda técnica / notas conocidas

- **Build de la imagen en este entorno**: el `pnpm install` del monorepo dentro
  del contenedor es lento/inestable por la red de este equipo (~32 KiB/s, socket
  timeouts en los fetch de metadata/attestations de npm). No es un defecto del
  Dockerfile; en CI (red rápida) o en Render buildea sin problema. Ver más abajo
  el resultado del build de validación local.
- **Seis ajustes reales del empaquetado en contenedor** (todos en
  `Dockerfile.service`, descubiertos corriendo la imagen):
  1. `nx prune` falla dentro del contenedor (`prune-lockfile`, exit 130) → se
     evita: el runtime instala desde el `package.json` que genera webpack.
  2. Falta OpenSSL en la imagen slim (motor de migraciones de Prisma) → `apt-get
     install openssl ca-certificates`.
  3. pnpm 11 bloquea los build scripts de Prisma sin `allowBuilds` → se copia el
     `pnpm-workspace.yaml` raíz a `/app`.
  4. El `package.json` de webpack **no lista** `tslib` (devDep, requerido en
     runtime) → `pnpm add tslib`.
  5. Tampoco lista `@prisma/client` (runtime del cliente generado) ni `pg` (peer
     de `@prisma/adapter-pg`) → `pnpm add @prisma/client pg` en servicios con base.
  6. Usuario no-root no puede ubicar el engine de Prisma en `node_modules` →
     `chown -R node:node /app` antes de `USER node`.
  Estos ajustes están validados con scoring-service; **conviene revalidar los
  otros 7 servicios con base** al primer deploy (mismo Dockerfile, mismas deps).
- **Render y URLs internas**: `fromService … hostport` devuelve `host:port` sin
  esquema, y los clientes internos esperan `http://…`; por eso los `*_INTERNAL_URL`
  quedaron `sync:false` con el valor exacto documentado en el runbook.
- **CloudAMQP free (1 nodo)**: las colas cuórum corren con 1 réplica (sin HA) —
  aceptable para 1 tenant piloto; el runbook marca el fallback.

## Verificación de criterios de aceptación (de `docs/phases/fase-13-piloto-deploy.md`)

- [ ] Los 9 servicios + Gateway + 2 frontends responden en producción y pasan su
  healthcheck. → **infra-as-code lista**; el deploy real lo ejecuta José.
- [ ] El flujo completo de Destino:Dorado corre en producción ≥1 ciclo de Sección
  sin intervención de emergencia. → pendiente del deploy + datos.
- [ ] Los datos reales cargados (sin seed genérico en el piloto). → pendiente de
  los datos confirmados.

## Endurecimiento previo al deploy (2026-08-10)

Salió de una auditoría de "¿esto está listo para producción?" que pidió José.
Todo lo de abajo estaba **abierto y sin registrar**: no son mejoras, son huecos
que un deploy real habría encontrado. Rama `fase-14-tienda-de-monedas`.

### Seguridad del Gateway

- **`TRUST_PROXY`** (`apps/gateway/src/proxy/trust-proxy.ts`, nuevo). El rate
  limiting cuenta por IP y detrás de un proxy —Caddy en el VPS, el balanceador
  de Render— la IP del socket es SIEMPRE la del proxy: todos los usuarios
  compartían un solo balde y **el límite de 10/min del login pasaba a ser
  10/min para toda la plataforma**. La defensa no quedaba floja, quedaba
  invertida: el primero que erraba la contraseña le cortaba el login al resto.
  Default `false` (casa, con el Gateway expuesto directo, donde confiar en
  `X-Forwarded-For` sería regalar el spoofeo); `1` en `prod.yml` y en
  `render.yaml`. **`true` se rechaza en el arranque** con un mensaje que
  explica por qué: es el valor que cualquiera pondría y el único que
  reintroduce el problema disfrazado de solución.
- **Cabeceras de seguridad** (`cabeceras-seguridad.middleware.ts`, nuevo):
  `helmet` configurado para una API, no para HTML — CSP `default-src 'none'` +
  `frame-ancestors 'none'`, CORP en `cross-origin` (el default `same-origin`
  de helmet habría roto a `app-web`, que siempre está en otro origen),
  `X-Frame-Options: DENY` (el default es `SAMEORIGIN`, lo destapó un test),
  y HSTS solo cuando hay TLS delante. Las mismas cabeceras en los tres
  frontends (`Caddyfile.spa`, `Caddyfile.estatico`, los 3 `vercel.json`).
  **Sin CSP en los frontends, a propósito y documentado en el Caddyfile**: el
  build de Angular inlinea CSS crítica con un `onload=`, y `connect-src` no se
  puede escribir al compilar porque la URL del Gateway se deriva de
  `window.location`. Mandarla a ciegas rompe la app en silencio.
- **`ADMIN_WEB_URL`** sumada a la lista de CORS. `admin-web` tenía su
  `vercel.json` desde la Fase 14-05 pero su origen nunca entró a la lista, así
  que desplegado a internet cargaba y moría en el preflight de cada llamada —
  que se ve como "el login no anda".

### Dependencias

- **`overrides: ip-address >=10.3.1`** en `pnpm-workspace.yaml`. GHSA alta que
  entraba por `express-rate-limit`: la **única** de las 30 alertas de
  `pnpm audit --prod` que tocaba código de producción, y justo el que decide a
  qué balde va cada request.
- `@angular-devkit/build-angular`, `@tailwindcss/vite` y `@astrojs/sitemap`
  movidos a `devDependencies` (estaban en `dependencies` sin ser runtime). No
  es cosmético: hacía que `pnpm audit --prod` reportara 30 hallazgos de
  herramientas de build y **el hallazgo real se perdiera entre el ruido**.
  Resultado: de 30 (11 altas) a **9 (2 altas)**, y las 2 que quedan entran por
  el CLI de Prisma, que no corre en el camino de un request.

### CI y tests

- **`admin-web` tenía 0 specs y su target `test` no se salteaba: fallaba**
  (`No tests found matching the following patterns`). Como CI corre
  `nx affected -t lint,test,build`, **cualquier PR que tocara admin-web dejaba
  el pipeline en rojo**. Se escribieron 17 tests (`jwt.util`,
  `SesionAdminService`, `adminGuard`), incluido el caso que justifica que el
  guard mire el rol y no solo si hay token.
- **Flake horario en la E2E, encontrado corriendo la suite**:
  `destinatario-y-vigencia.e2e.ts` armaba `diasSemana` con
  `new Date().getDay()` —el día de la máquina— y después le preguntaba al
  backend, que resuelve el día en la **timezone del Grupo**. Entre la
  medianoche de Buenos Aires y la local los dos días son distintos, así que el
  test dejaba HOY dentro de los días permitidos y la actividad se registraba:
  esperaba 409, recibía 201. En un runner de CI en UTC la ventana es de 21:00 a
  24:00 — **uno de cada ocho pipelines en rojo sin que cambie una línea de
  código**. Se agregó `diaSemanaDelGrupo()` en `support/escenario.ts` (misma
  cuenta que hace el servicio) y `TIMEZONE_GRUPO` como única fuente.

### Despliegue

- **`ai-service` sumado a `docker-compose.prod.yml`, `stack.yml`,
  `docker-compose.images.yml` y al matrix de `images.yml`.** Estaba solo en
  `casa.yml`: **el despliegue a internet salía sin asistente** aunque el código
  estuviera mergeado. Era la deuda que este mismo archivo dejaba anotada.
- **Imágenes multi-arquitectura (amd64 + arm64)** en `images.yml`, con runners
  nativos `ubuntu-24.04-arm` (no QEMU: emular el `pnpm install` del monorepo no
  termina) y un job `manifest` que une los dos tags en `:latest`. Habilita las
  máquinas ARM, que es donde está el hosting gratuito de verdad.
- **`admin-web` en el runbook del VPS** como tercer proyecto de Vercel. Sin él
  desplegado no hay interfaz para cambiar el plan de una organización ni para
  suspenderla.

### Backups (era una línea sugerida en un documento; ahora corre solo)

`scripts/backup-postgres.sh` + `scripts/restore-postgres.sh`, y un servicio
`backup` en `prod.yml` y en `casa.yml` que corre **todos los días a las 03:00**
con `restart: unless-stopped`. Un `.sql.gz` **por base** y no un `pg_dumpall`:
los incidentes también son de a uno, y con un archivo por base restaurar es
cirugía en vez de volver el reloj atrás en todo el sistema.

Cada dump **se verifica apenas se escribe** (`gzip -t` + el marcador final de
`pg_dump`) porque un backup que "anduvo" pero quedó cortado es peor que no
tener backup. Si falla alguna base, la carpeta se renombra a `_INCOMPLETO` y la
retención **nunca la borra**: es la evidencia de que algo viene fallando, y es
justo lo que una limpieza automática haría desaparecer.

**Probado de verdad contra Postgres**, no solo escrito: backup de las 9 bases →
borrado de una tabla → restore → los conteos vuelven idénticos
(`RegistroAuditoria=26302`, la fila centinela de vuelta, 7 índices intactos), y
el camino de error verificado con una base inexistente (marcó `_INCOMPLETO`,
salió con código 1).

### Verificación de esta tanda

- `nx run-many -t lint test build`: **19 proyectos en verde**, 0 errores.
- **E2E completa contra el stack real** (`node scripts/e2e-up.mjs`, los 10
  procesos + Postgres + RabbitMQ): **92 passed, 0 failed**. Los 23 skipped son
  los de navegador, que piden `E2E_UI=1` a propósito.
  - Antes del arreglo de timezone: 91 passed, **1 failed** — y se verificó el
    arreglo *dentro de la misma ventana horaria* que provocaba la falla, que es
    la única forma de saber que no se arregló solo por pasar la medianoche.
- `docker compose config` en los 4 composes (incluido el overlay de imágenes).

### Lo que sigue abierto (no se tocó en esta tanda)

- **Sin observabilidad**: ni Sentry, ni métricas, ni alertas. Solo `pino` a
  stdout, que en Docker se pierde al recrear el contenedor.
- **Sin recuperación ni cambio de contraseña**: `identity` expone `login`,
  `refresh`, `logout` y `organizaciones`, y no hay SMTP en ningún servicio. Un
  olvido de contraseña se arregla con un `UPDATE` a mano.
- **Sacar los backups de la máquina sigue siendo manual.** Un dump en el mismo
  disco que la base no protege del caso más común, que es perder el disco.
- Los tres ítems de Fase 14 que bloquean un lanzamiento comercial (pagos,
  privacidad de menores, white-label) siguen `PENDIENTE` en su archivo.

## Cuarta variante de despliegue: LIBRE, en internet y sin costo (2026-08-10)

Pedido de José: "un plan para deployarlo 100% gratis, supongo que se podría si
todo se encapsula en un solo docker". La respuesta corta es que **sí se puede,
pero no por ahí**: consolidar los 10 servicios en una imagen no desbloquea
ningún tier gratuito —los que regalan un contenedor dan 256–512 MB y lo duermen,
y esto necesita ~2 GB y procesos que no pueden dormir— y encima se pierde
reinicio, logs y health por servicio. La unidad que importa no es el contenedor,
es la máquina. Así que la variante consigue **una máquina gratis** (Oracle Cloud
Always Free, ARM) y corre el compose que ya existía.

### La decisión de diseño: UN SOLO ORIGEN

Todo se sirve del mismo dominio, repartido por prefijo: `/` public-site, `/app/`
app-web, `/admin/` admin-web, `/api/…` el Gateway.

No es comodidad. **`duckdns.org` está en la Public Suffix List**, así que
`app.tuyo.duckdns.org` y `api.tuyo.duckdns.org` serían sitios DISTINTOS para el
navegador: `dorado_refresh` es `SameSite=Lax`, no viajaría, y el login quedaría
roto de una forma que se ve como "la contraseña no anda". Con origen único no
hay CORS, la cookie es first-party y el handoff de sesión del registro
(public-site → app-web) funciona como está escrito en `registro.ts`.

Efecto lateral bueno: las SPAs se compilan con `apiBaseUrl` **relativo**, así que
**no llevan el dominio adentro** — cambiar de dominio no obliga a reconstruirlas.

### Lo agregado

- **Configuración de build `libre`** en `app-web` y `admin-web`: `baseHref`
  (`/app/`, `/admin/`) + `fileReplacements` a un `environment.libre.ts` nuevo
  con `apiBaseUrl: '/api'`.
- **`Dockerfile.web`**: build arg `CONFIG` (default `casa`, para no cambiar el
  comportamiento existente) y los tres `PUBLIC_*` de public-site. Hay un
  `unset` explícito de esas tres variables cuando vienen vacías: **un ARG
  declarado queda como variable de entorno del RUN aunque esté vacío**, y el
  código de public-site usa `?? fallback`, que solo salta con `undefined`. Sin
  el `unset`, el modo casa habría empezado a mandar el POST del registro
  relativo contra el :4321 del sitio en vez de contra el Gateway.
- **`Caddyfile.libre`**: el borde. `handle` (sin strip) para `/api/*` porque el
  Gateway rutea por ese prefijo, `handle_path` (con strip) para las dos SPAs, y
  el sitio público de catch-all.
- **`docker-compose.libre.yml`** + **`.env.libre.example`**: los 10 backends, los
  3 frontends, Postgres, RabbitMQ, backups y el borde. Único puerto expuesto:
  80/443. `TRUST_PROXY=1`, `REFRESH_COOKIE_SECURE=true`.
- **`docs/runbook-deploy-libre.md`**: paso a paso, con los dos firewalls de
  Oracle (Security List **y** el `iptables` de la imagen Ubuntu, que es el error
  que más tiempo hace perder) y la sección de lo que uno acepta al no pagar.

### Bug encontrado y corregido en el camino

Los `.env.*.example` usan comentarios inline (`VAR=    # explicación`).
`docker compose` los saca bien **cuando la variable tiene valor**, pero si queda
vacía **se lleva el comentario COMO valor**. Con las variables que están
justamente para dejar vacías eso rompe el arranque: `ADMIN_WEB_URL` habría
llegado al Gateway como `"# https://…"` y no habría pasado su validación de URL
(o sea, **el Gateway no levantaba**), y `OPENAI_API_KEY` habría llegado como
`"# [SECRETO]"`, 12 caracteres, y ai-service tampoco. Las dos las había agregado
yo hoy. Corregido moviendo el comentario arriba, con la explicación al lado para
que no se reintroduzca. El resto de las variables del archivo se dejan como
están: se completan siempre, y ahí el parseo es correcto.

### Verificación

Además de `lint test build` en verde (19 proyectos), se **probó el enrutamiento
real**: se levantó el `Caddyfile.libre` de verdad con los dists compilados y un
stub del Gateway, y se comprobó contra HTTP:

- `/api/health` y `/api/auth/login` llegan al Gateway **con el path intacto**
  (si se strippeara, no reconocería ninguna ruta y todo daría 404);
- `/app/` y el deep link `/app/tutor/actividades` sirven la SPA (fallback a
  index.html), y los assets que pide el HTML resuelven por el `<base href>`:
  `/app/main-*.js` y `/app/styles-*.css` dan 200;
- `/admin/` sirve la otra SPA y su bundle;
- `/` sirve el sitio público y **`/no-existe` da 404**, no la home;
- `/app` y `/admin` sin barra redirigen 301 a la versión con barra;
- las cabeceras llegan bien y **sin pisarse**: HSTS del borde y
  `Permissions-Policy: microphone=(self)` de app-web conviven (si el borde
  hubiera puesto una Permissions-Policy genérica, habría apagado el dictado);
- public-site quedó con los links al `/app` del mismo origen y el registro
  apuntando a `/api/auth/organizaciones`.

Lo que **no** se pudo verificar desde acá: la instancia de Oracle en sí y el
certificado de Let's Encrypt (hacen falta la cuenta y el DNS).

### Segundo modo de la variante libre: PRIVADO con Tailscale (2026-08-11)

José acotó el alcance: "solo para mi familia de 5 personas, no es necesario que
sea público para todo el mundo". Eso cambia la recomendación, y no por
comodidad: el sistema **no tiene recuperación de contraseña, ni observabilidad,
ni alertas**, y guarda datos de chicos. Publicarlo a internet para que lo usen
cinco personas conocidas es aceptar una superficie de ataque que no hace falta.

El stack es el mismo; cambia **quién puede llegar**. Se agregó un segundo modo
al mismo `docker-compose.libre.yml` en vez de un quinto archivo:

- **`BORDE_SITIO`** (default `${DOMINIO}`) reemplaza al `{$DOMINIO}` del
  `Caddyfile.libre`. En Caddy el formato de la dirección del sitio ES la
  configuración: un nombre de dominio activa HTTPS automático, y `:80` sirve
  HTTP plano sin intentar sacar certificado. En modo Tailscale eso último es lo
  correcto **y lo único posible**: no hay nada publicado a internet contra qué
  validar un desafío de Let's Encrypt. El TLS lo termina `tailscale serve` sobre
  el nombre `*.ts.net`, que ya viene con certificado.
- **`BORDE_HTTP` / `BORDE_HTTPS`** parametrizan los puertos publicados. En modo
  familiar quedan en `127.0.0.1:8080` / `127.0.0.1:8443`: el borde **no se
  alcanza desde la red**, solo desde la propia máquina, que es de donde le habla
  `tailscale serve`.
- **`TRUST_PROXY`** pasó de estar fijo en `1` a `${TRUST_PROXY:-1}`, y el modo
  Tailscale usa **2**: hay dos saltos delante del Gateway (Serve, que pone el
  `X-Forwarded-For` con la IP real del cliente — verificado que lo hace —, y el
  borde, que agrega el suyo al proxear). Se documentó por qué no se pone un
  número más alto "por las dudas": de más, haría confiable un header que el
  cliente puede escribir.

Ventaja de haber elegido origen único: **no hay que tocar `cors-origin.ts`**. Si
se hubiera ido por el modo casa sobre Tailscale, habría hecho falta, porque el
rango de Tailscale es `100.64.0.0/10` (CGNAT) y los nombres son `*.ts.net` —
ninguno de los dos entra en `IPV4_PRIVADA` ni en `SUFIJOS_LOCALES`, así que el
CORS los habría rechazado.

Dato de plan: el free de Tailscale pasó a **6 usuarios y dispositivos
ilimitados** (abril 2026), que es justo el tamaño de una familia.

Verificado: `lint test build` en verde, los 4 composes resuelven, los dos modos
del borde producen la configuración esperada (público → `80:80`/`443:443` y el
dominio como sitio; Tailscale → `:80` y los puertos atados a loopback), y se
volvió a correr el banco de pruebas de ruteo con la variable ya renombrada.
Sin verificar desde acá: la tailnet real y `tailscale serve` (hacen falta las
cuentas y los dispositivos).

## Qué debería verificar la próxima sesión

- Confirmar con José los datos bloqueantes (catálogo/usernames/recompensas).
- **`images.yml` multi-arch no se pudo verificar desde acá** (solo corre en
  GitHub Actions, con push a `main`): mirar que los 20 builds pasen y que el
  job `manifest` arme bien los `:latest`.
- Al desplegar, seguir `docs/runbook-deploy.md` (Render),
  `docs/runbook-deploy-vps.md` (VPS) o `docs/runbook-deploy-casa.md` (casa).
