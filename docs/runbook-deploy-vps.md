# Runbook de despliegue — VPS único (opción económica del piloto)

Backend completo (9 servicios + Postgres + RabbitMQ + Caddy/HTTPS) en **una sola
máquina** con `infra/docker/docker-compose.prod.yml`. Los 2 frontends van a
**Vercel** (estáticos, gratis). Costo aprox.: **US$6–12/mes** (el VPS) + dominio.

> Alternativa gestionada (Render + CloudAMQP): ver `docs/runbook-deploy.md`.
> Con el VPS **NO hace falta CloudAMQP** — RabbitMQ corre en el compose.

---

## 0. Lo que necesitás antes

- Un **VPS** Ubuntu 24.04. Dos variantes de tamaño (paso 6):
  - **Variante B — imágenes pre-construidas (recomendada, más barata)**: alcanza
    **2 GB RAM** (ej. DigitalOcean $12/mes). Las 9 imágenes se construyen en
    GitHub Actions y el VPS solo las descarga y corre.
  - **Variante A — buildear en el server**: necesita **4 GB RAM** (ej. DO $24/mes
    o Hetzner CX22 ~€4.5). Se construye todo en el VPS, sin depender de GHCR.
- Un **dominio** (o subdominio). Vas a usar 3 nombres:
  - `api.tudominio.com` → el **gateway** (en el VPS).
  - `app.tudominio.com` → **app-web** (Vercel).
  - `www.tudominio.com` (o el raíz) → **public-site** (Vercel).
  > Recomendado que app-web y el gateway compartan dominio raíz (`app.` y `api.`
  > de `tudominio.com`): así la cookie de refresh (httpOnly, misma-site) funciona
  > sin fricción.

## 1. DNS

En tu proveedor de dominio, creá registros **A** apuntando a la IP del VPS:
- `api.tudominio.com  →  <IP_DEL_VPS>`

(Los de `app.` y `www.` los vas a apuntar a Vercel en el paso 7, con los valores
que te dé Vercel.)

## 2. Preparar el VPS

SSH al VPS y instalá Docker + el plugin compose:

```bash
curl -fsSL https://get.docker.com | sh
# firewall: solo SSH + HTTP + HTTPS
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
# (opcional pero recomendado en 4 GB: swap para que el build no se quede sin RAM)
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 3. Clonar el repo

```bash
git clone https://github.com/mariosoto1551/dorado-proj.git
cd dorado-proj
```

## 4. Claves JWT (en TU máquina, no en el VPS)

```bash
node tools/generar-claves-jwt.mjs      # imprime JWT_PRIVATE_KEY y JWT_PUBLIC_KEY
```
Copiá ambos valores; van al `.env.prod` del paso 5.

## 5. Secretos del stack

En el VPS, dentro del repo:

```bash
cp infra/docker/.env.prod.example infra/docker/.env.prod
nano infra/docker/.env.prod
```
Completá (ver comentarios del archivo):
- `POSTGRES_PASSWORD`, `RABBITMQ_PASS` → generá fuertes (`openssl rand -hex 24`).
- `GATEWAY_INTERNAL_SECRET` → `openssl rand -hex 32`.
- `JWT_PUBLIC_KEY` / `JWT_PRIVATE_KEY` → paso 4.
- `GATEWAY_DOMAIN=api.tudominio.com`.
- `APP_WEB_URL` / `PUBLIC_SITE_URL` → los dejás vacíos por ahora; se completan en
  el paso 7 cuando tengas los dominios de Vercel (y recreás el gateway).

## 6. Levantar el stack

Elegí la variante según el tamaño del VPS.

### Variante B — imágenes pre-construidas (VPS de 2 GB, recomendada)

Las imágenes las construye GitHub Actions (`.github/workflows/images.yml`) y
viven en GHCR. Primero, **una vez**, generá un *Personal Access Token* de GitHub
con scope **`read:packages`** (Settings → Developer settings → Tokens) y logueate:

```bash
echo "<TU_PAT>" | docker login ghcr.io -u mariosoto1551 --password-stdin
```
> Las imágenes son privadas por defecto (atadas a tu repo). Alternativa: hacer
> públicos los 9 paquetes en GitHub (Packages → cada uno → Package settings →
> Change visibility) y saltear el login.

Luego, descargá y levantá (sin buildear):
```bash
docker compose \
  -f infra/docker/docker-compose.prod.yml \
  -f infra/docker/docker-compose.images.yml \
  --env-file infra/docker/.env.prod pull
docker compose \
  -f infra/docker/docker-compose.prod.yml \
  -f infra/docker/docker-compose.images.yml \
  --env-file infra/docker/.env.prod up -d --no-build
```

### Variante A — buildear en el server (VPS de 4 GB)

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d --build
```

### En ambas variantes
- Postgres crea las 8 bases solo (script de init, primer arranque).
- Cada servicio corre sus migraciones al iniciar (`prisma migrate deploy`).
- Caddy saca el certificado HTTPS de `api.tudominio.com` automáticamente (el DNS
  del paso 1 tiene que estar propagado).

Verificar:
```bash
curl https://api.tudominio.com/api/health      # → status: ok con los 9 servicios
docker compose -f infra/docker/docker-compose.prod.yml ps   # todos "healthy"/"running"
```

## 7. Frontends en Vercel

**Tres** proyectos, todos con **Root Directory = raíz del repo**:
- **app-web** (`apps/app-web/vercel.json`): antes de deployar, editá
  `apps/app-web/src/environments/environment.prod.ts` →
  `apiBaseUrl: 'https://api.tudominio.com/api'` y commiteás/pusheás. En Vercel,
  asigná el dominio `app.tudominio.com`.
- **public-site** (`apps/public-site/vercel.json`): env de build
  `PUBLIC_GATEWAY_URL=https://api.tudominio.com`,
  `PUBLIC_APP_WEB_URL=https://app.tudominio.com`, `SITE_URL=https://tudominio.com`.
- **admin-web** (`apps/admin-web/vercel.json`) — el panel de `PLATFORM_ADMIN`.
  Mismo procedimiento que app-web pero con
  `apps/admin-web/src/environments/environment.prod.ts`, y dominio
  `admin.tudominio.com`. Es la única forma de cambiarle el plan a una
  organización o de suspenderla: sin esto desplegado, esas dos operaciones
  quedan sin interfaz.

  > Acordate de poner `ADMIN_WEB_URL=https://admin.tudominio.com` en
  > `.env.prod` (paso 8): sin eso el Gateway no incluye ese origen en la lista
  > de CORS y el panel carga pero muere en el preflight de cada llamada — que
  > se ve como un problema de login y no lo es.

Apuntá los DNS `app.`, `admin.` y `www.` a Vercel (te da los valores al asignar
cada dominio).

## 8. Cerrar CORS

En el VPS, editá `infra/docker/.env.prod`:
```
APP_WEB_URL=https://app.tudominio.com
PUBLIC_SITE_URL=https://tudominio.com
ADMIN_WEB_URL=https://admin.tudominio.com   # solo si desplegaste el panel
```
Recreá solo el gateway:
```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d gateway
```

## 9. Alta del tenant "Destino: Dorado" (los datos reales, por la UI)

1. Registrás la organización desde `https://tudominio.com` (public-site).
2. Entrás a `https://app.tudominio.com`, creás el grupo y configurás
   Sesión/Sección (modo AUTOMATICO, 6 sesiones/sección, crons lun–sáb).
3. Cargás **umbrales, actividades, conductas, recompensas** por pantalla.
4. Invitás a los 3 hijos + 2º tutor; canjean con su `username`.

## 10. Operación

```bash
# ver logs de un servicio
docker compose -f infra/docker/docker-compose.prod.yml logs -f scoring-service
# actualizar tras un git pull
git pull && docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d --build
```

### Backups

El servicio `backup` del compose los corre **solo, todos los días a las 03:00
UTC** (`scripts/backup-postgres.sh`): un `.sql.gz` por base, verificado apenas
se escribe, con retención de 14 días. No hay nada que configurar ni ningún cron
que agregar al host.

```bash
COMPOSE="-f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod"

# ver qué backups hay
docker compose $COMPOSE exec backup ls -1 /backups
# forzar uno ahora (sin esperar a las 03:00)
docker compose $COMPOSE exec backup /usr/local/bin/backup-postgres.sh
```

Una carpeta que termina en **`_INCOMPLETO`** es un backup al que le faltó al
menos una base: la retención no las borra nunca, justamente para que se vean.

**Sacar los dumps de la máquina** (esto sigue siendo manual, y es lo que
convierte el backup en algo útil: un dump en el mismo disco que la base no te
salva de perder el disco):

```bash
# desde tu PC, bajar el último backup
docker compose $COMPOSE exec backup tar -cz -C /backups . > dorado-backups-$(date +%F).tar.gz
```

**Restaurar** (destructivo — dropea y recrea la base):

```bash
docker compose $COMPOSE exec backup \
  /usr/local/bin/restore-postgres.sh /backups/2026-08-10_0300 scoring_db
# sin el nombre de la base, restaura las 9
```

- **RabbitMQ Management** (UI en :15672) no se expone a internet. Para verlo,
  túnel SSH: `ssh -L 15672:localhost:15672 usuario@vps` y luego abrí
  `localhost:15672` (pero primero exponé el puerto solo a localhost si lo
  necesitás; por defecto queda interno al compose).
- **No abrir** el registro público a otras organizaciones todavía (Fase 14).
