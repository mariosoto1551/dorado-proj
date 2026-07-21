# Runbook de despliegue — VPS único (opción económica del piloto)

Backend completo (9 servicios + Postgres + RabbitMQ + Caddy/HTTPS) en **una sola
máquina** con `infra/docker/docker-compose.prod.yml`. Los 2 frontends van a
**Vercel** (estáticos, gratis). Costo aprox.: **US$6–12/mes** (el VPS) + dominio.

> Alternativa gestionada (Render + CloudAMQP): ver `docs/runbook-deploy.md`.
> Con el VPS **NO hace falta CloudAMQP** — RabbitMQ corre en el compose.

---

## 0. Lo que necesitás antes

- Un **VPS** Ubuntu 24.04, **mínimo 4 GB RAM** (los 9 servicios Node + Postgres +
  RabbitMQ). DigitalOcean, Hetzner (el más barato), Vultr, etc.
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

```bash
docker compose -f infra/docker/docker-compose.prod.yml --env-file infra/docker/.env.prod up -d --build
```
- Construye las 9 imágenes (la primera vez tarda; el install del monorepo se
  cachea y se comparte entre servicios).
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

Dos proyectos, ambos con **Root Directory = raíz del repo**:
- **app-web** (`apps/app-web/vercel.json`): antes de deployar, editá
  `apps/app-web/src/environments/environment.prod.ts` →
  `apiBaseUrl: 'https://api.tudominio.com/api'` y commiteás/pusheás. En Vercel,
  asigná el dominio `app.tudominio.com`.
- **public-site** (`apps/public-site/vercel.json`): env de build
  `PUBLIC_GATEWAY_URL=https://api.tudominio.com`,
  `PUBLIC_APP_WEB_URL=https://app.tudominio.com`, `SITE_URL=https://tudominio.com`.

Apuntá los DNS `app.` y `www.` a Vercel (te da los valores al asignar el dominio).

## 8. Cerrar CORS

En el VPS, editá `infra/docker/.env.prod`:
```
APP_WEB_URL=https://app.tudominio.com
PUBLIC_SITE_URL=https://tudominio.com
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
# backup de Postgres (recomendado semanal)
docker compose -f infra/docker/docker-compose.prod.yml exec postgres \
  pg_dumpall -U dorado > backup-$(date +%F).sql
```

- **RabbitMQ Management** (UI en :15672) no se expone a internet. Para verlo,
  túnel SSH: `ssh -L 15672:localhost:15672 usuario@vps` y luego abrí
  `localhost:15672` (pero primero exponé el puerto solo a localhost si lo
  necesitás; por defecto queda interno al compose).
- **No abrir** el registro público a otras organizaciones todavía (Fase 14).
